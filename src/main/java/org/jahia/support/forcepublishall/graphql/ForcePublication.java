package org.jahia.support.forcepublishall.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import org.jahia.api.Constants;
import org.jahia.exceptions.JahiaRuntimeException;
import org.jahia.modules.graphql.provider.dxm.DataFetchingException;
import org.jahia.modules.graphql.provider.dxm.node.GqlJcrNode;
import org.jahia.modules.graphql.provider.dxm.node.GqlJcrNodeMutation;
import org.jahia.modules.graphql.provider.dxm.node.GqlJcrWrongInputException;
import org.jahia.modules.graphql.provider.dxm.node.NodeQueryExtensions;
import org.jahia.osgi.BundleUtils;
import org.jahia.services.content.*;
import org.jahia.services.scheduler.BackgroundJob;
import org.jahia.services.scheduler.SchedulerService;
import org.quartz.JobDataMap;
import org.quartz.JobDetail;
import org.quartz.SchedulerException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.jcr.InvalidItemStateException;
import javax.jcr.ItemNotFoundException;
import javax.jcr.PathNotFoundException;
import javax.jcr.RepositoryException;
import java.util.*;

@GraphQLTypeExtension(GqlJcrNodeMutation.class)
public final class ForcePublication {

    private static final Logger logger = LoggerFactory.getLogger(ForcePublication.class);

    private static final String PERMISSION_PUBLISH = "publish";

    /**
     * The "site-admin" permission matches the requiredPermission declared in the React UI
     * ({@code useNodeChecks(..., { requiredPermission: ['publish', 'site-admin'] })}).
     * This is a node-level permission resolved via {@link JCRNodeWrapper#hasPermission(String)}.
     */
    private static final String PERMISSION_SITE_ADMIN = "site-admin";

    /**
     * Label passed to {@link BackgroundJob#createJahiaJob(String, Class)} to identify
     * force-publication jobs in the Jahia scheduler UI.
     */
    private static final String JOB_LABEL_PUBLICATION = "Publication";

    /**
     * Bounded retry count for the live-workspace delete step when it hits an
     * {@link InvalidItemStateException} (execution finding, SUPPORT-646, spec 01): a
     * concurrent {@code PublicationJob} on an overlapping path can still be writing to the
     * same LIVE session, causing a transient optimistic-concurrency conflict rather than a
     * genuine failure. Kept small and bounded — this is a resilience fix, not a queuing
     * redesign.
     */
    private static final int LIVE_DELETE_MAX_ATTEMPTS = 5;

    /**
     * Base backoff (multiplied by the attempt number) between live-delete retries. With
     * {@link #LIVE_DELETE_MAX_ATTEMPTS} = 5 this gives a worst-case cumulative wait of
     * 300 + 600 + 900 + 1200 = 3000ms, chosen to comfortably outlast the ~3s duration observed
     * for a large (237-node) concurrent PublicationJob on an overlapping path (execution
     * finding, SUPPORT-646, spec 01) while staying bounded.
     */
    private static final long LIVE_DELETE_RETRY_BACKOFF_MS = 300L;

    private final GqlJcrNodeMutation nodeMutation;

    private void validateNodeWorkspace(GqlJcrNode node) {
        try {
            final JCRSessionWrapper session = node.getNode().getSession();
            if (!session.getWorkspace().getName().equals(Constants.EDIT_WORKSPACE)) {
                throw new GqlJcrWrongInputException("Publication fields can only be used with nodes from " + NodeQueryExtensions.Workspace.EDIT + " workspace");
            }
        } catch (RepositoryException e) {
            throw new JahiaRuntimeException(e);
        }
    }

    /**
     * Create a publication mutation extension instance.
     *
     * @param nodeMutation JCR node mutation to apply the extension to
     * @throws GqlJcrWrongInputException In case the parameter represents a node from LIVE rather than EDIT workspace
     */
    public ForcePublication(GqlJcrNodeMutation nodeMutation) throws GqlJcrWrongInputException {
        validateNodeWorkspace(nodeMutation.getNode());
        this.nodeMutation = nodeMutation;
    }

    /**
     * Forces publication of the entire subtree rooted at the target node.
     *
     * <p>The operation proceeds in two steps:
     * <ol>
     *   <li>The subtree is <strong>deleted</strong> from the LIVE workspace, bypassing the
     *       normal publication workflow. If the node does not yet exist in LIVE
     *       ({@link ItemNotFoundException} / {@link PathNotFoundException}), that is silently
     *       accepted. Any other {@link RepositoryException} is logged with context and causes
     *       the method to abort — the publication job is <strong>not</strong> scheduled when
     *       the live-delete fails.</li>
     *   <li>A {@link PublicationJob} is scheduled immediately to republish the full subtree
     *       from EDIT to LIVE.</li>
     * </ol>
     *
     * <p><strong>Required permissions:</strong> the caller must hold both the
     * {@code publish} and {@code site-admin} node-level permissions on the target node.
     * These match the permissions declared in the React UI component
     * ({@code requiredPermission: ['publish', 'site-admin']}).
     *
     * <p><strong>DESTRUCTIVE:</strong> the live subtree is fully removed before republication.
     * There is no transactional rollback — if the subsequent publication job fails, the live
     * content will be absent until a successful publication is triggered.
     *
     * @return {@code true} when the publication job has been successfully scheduled
     * @throws DataFetchingException    if the caller lacks {@code publish} or {@code site-admin}
     *                                  permission, or the live-delete fails for a reason other
     *                                  than the node not existing in LIVE. {@link DataFetchingException}
     *                                  extends {@link org.jahia.modules.graphql.provider.dxm.BaseGqlClientException},
     *                                  so its message is forwarded verbatim to GraphQL clients
     *                                  instead of being masked as a generic "Internal Server
     *                                  Error(s)" (see {@code JahiaDataFetchingExceptionHandler}) —
     *                                  a plain {@link javax.jcr.AccessDeniedException} or
     *                                  {@link JahiaRuntimeException} would not be (verified:
     *                                  SUPPORT-646 execution/bugfix reports, spec S5).
     * @throws JahiaRuntimeException    if a required OSGi service is unavailable, or an unexpected
     *                                  {@link RepositoryException} / {@link SchedulerException} occurs
     */
    @GraphQLField
    @GraphQLName("forcePublish")
    @GraphQLDescription("Force the publication of the whole sub-tree by first deleting everything in live and then republishing the whole sub-tree")
    public Boolean forcePublish() throws RepositoryException {
        final ComplexPublicationService complexPublicationService = BundleUtils.getOsgiService(ComplexPublicationService.class, null);
        if (complexPublicationService == null) {
            throw new JahiaRuntimeException("Required OSGi service ComplexPublicationService is not available");
        }
        final SchedulerService schedulerService = BundleUtils.getOsgiService(SchedulerService.class, null);
        if (schedulerService == null) {
            throw new JahiaRuntimeException("Required OSGi service SchedulerService is not available");
        }

        final JCRNodeWrapper nodeToPublish = nodeMutation.getNode().getNode();
        if (!nodeToPublish.hasPermission(PERMISSION_PUBLISH)) {
            throw new DataFetchingException("Permission '" + PERMISSION_PUBLISH + "' is required to force-publish node: " + nodeToPublish.getPath());
        }
        if (!nodeToPublish.hasPermission(PERMISSION_SITE_ADMIN)) {
            throw new DataFetchingException("Permission '" + PERMISSION_SITE_ADMIN + "' is required to force-publish node: " + nodeToPublish.getPath());
        }

        final String uuid = nodeToPublish.getIdentifier();
        final String path = nodeToPublish.getPath();

        try {
            final Set<String> activeLiveLanguagesSet = nodeToPublish.getResolveSite().getActiveLiveLanguages();
            final JCRSessionWrapper session = JCRSessionFactory.getInstance().getCurrentUserSession(Constants.EDIT_WORKSPACE);

            logger.info("Force publication of node with UUID: {}, path {}", uuid, path);

            final boolean[] liveDeleteFailed = {false};
            JCRTemplate.getInstance().doExecuteWithSystemSessionAsUser(null, Constants.LIVE_WORKSPACE, null, sessionWrapper -> {
                for (int attempt = 1; attempt <= LIVE_DELETE_MAX_ATTEMPTS; attempt++) {
                    try {
                        final JCRNodeWrapper node = sessionWrapper.getNodeByUUID(uuid);
                        if (node != null) {
                            node.remove();
                            sessionWrapper.save();
                            logger.info("Deleted node with UUID: {}, path {} in live workspace", uuid, path);
                        }
                        return null;
                    } catch (ItemNotFoundException | PathNotFoundException ex) {
                        // Node does not yet exist in LIVE — safe to ignore and proceed with publication
                        logger.debug("Node UUID: {}, path {} not found in live workspace, proceeding with publication", uuid, path);
                        return null;
                    } catch (InvalidItemStateException ex) {
                        // Transient optimistic-concurrency conflict: a concurrent PublicationJob
                        // on an overlapping path is still writing to this LIVE session. Refresh
                        // and retry a bounded number of times before giving up (execution
                        // finding, SUPPORT-646, spec 01).
                        if (attempt == LIVE_DELETE_MAX_ATTEMPTS) {
                            logger.error("Failed to delete node UUID: {}, path {} from live workspace after {} attempts due to repeated stale-item conflicts — aborting force publication", uuid, path, LIVE_DELETE_MAX_ATTEMPTS, ex);
                            liveDeleteFailed[0] = true;
                            return null;
                        }
                        logger.warn("Stale item deleting node UUID: {}, path {} from live workspace (attempt {}/{}) — refreshing and retrying", uuid, path, attempt, LIVE_DELETE_MAX_ATTEMPTS);
                        try {
                            sessionWrapper.refresh(false);
                            Thread.sleep(LIVE_DELETE_RETRY_BACKOFF_MS * attempt);
                        } catch (RepositoryException refreshEx) {
                            logger.error("Failed to refresh live session after stale-item conflict for node UUID: {}, path {}", uuid, path, refreshEx);
                            liveDeleteFailed[0] = true;
                            return null;
                        } catch (InterruptedException interruptedEx) {
                            Thread.currentThread().interrupt();
                            liveDeleteFailed[0] = true;
                            return null;
                        }
                        // Loop again for the next attempt.
                    } catch (RepositoryException ex) {
                        logger.error("Failed to delete node UUID: {}, path {} from live workspace — aborting force publication", uuid, path, ex);
                        liveDeleteFailed[0] = true;
                        return null;
                    }
                }
                return null;
            });

            if (liveDeleteFailed[0]) {
                throw new DataFetchingException("Live-workspace deletion failed for node UUID: " + uuid + ", path: " + path + " — publication job was not scheduled");
            }

            final Collection<ComplexPublicationService.FullPublicationInfo> fullPublicationInfos = complexPublicationService.getFullPublicationInfos(Collections.singletonList(uuid), activeLiveLanguagesSet, true, session);
            final List<String> allUuids = getAllUuids(fullPublicationInfos);
            final JobDetail jobDetail = BackgroundJob.createJahiaJob(JOB_LABEL_PUBLICATION, PublicationJob.class);
            final JobDataMap jobDataMap = jobDetail.getJobDataMap();
            jobDataMap.put(PublicationJob.PUBLICATION_UUIDS, allUuids);
            jobDataMap.put(PublicationJob.PUBLICATION_PATHS, Collections.singletonList(path));
            jobDataMap.put(PublicationJob.SOURCE, Constants.EDIT_WORKSPACE);
            jobDataMap.put(PublicationJob.DESTINATION, Constants.LIVE_WORKSPACE);
            jobDataMap.put(PublicationJob.CHECK_PERMISSIONS, true);

            logger.info("Scheduling publication job for node with UUID: {}, path {}, will publish {} nodes in {} languages", uuid, path, allUuids.size(), activeLiveLanguagesSet.size());
            schedulerService.scheduleJobNow(jobDetail);
        } catch (RepositoryException | SchedulerException e) {
            throw new JahiaRuntimeException("Force publication failed for node UUID: " + uuid + ", path: " + path, e);
        }

        return true;
    }

    /**
     * Collects all JCR UUIDs from a publication info collection that should be included in a
     * force-publication job. Nodes with status {@link PublicationInfo#DELETED} are skipped.
     * For each non-deleted info, the node identifier, the translation node identifier (if any),
     * and any deleted-translation node identifiers are added.
     *
     * <p>Package-private to allow unit testing without reflection.
     *
     * @param fullPublicationInfo publication infos returned by {@link ComplexPublicationService}
     * @return mutable list of UUIDs to pass to the publication job
     */
    static List<String> getAllUuids(Collection<ComplexPublicationService.FullPublicationInfo> fullPublicationInfo) {
        final List<String> uuids = new ArrayList<>();
        for (ComplexPublicationService.FullPublicationInfo info : fullPublicationInfo) {
            if (info.getPublicationStatus() != PublicationInfo.DELETED) {
                if (info.getNodeIdentifier() != null) {
                    uuids.add(info.getNodeIdentifier());
                }
                if (info.getTranslationNodeIdentifier() != null) {
                    uuids.add(info.getTranslationNodeIdentifier());
                }
                if (info.getDeletedTranslationNodeIdentifiers() != null) {
                    uuids.addAll(info.getDeletedTranslationNodeIdentifiers());
                }
            }
        }
        return uuids;
    }
}
