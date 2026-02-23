package org.jahia.support.forcepublishall.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Dictionary;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import javax.jcr.AccessDeniedException;
import javax.jcr.RepositoryException;
import org.jahia.api.Constants;
import org.jahia.exceptions.JahiaRuntimeException;
import org.jahia.modules.graphql.provider.dxm.node.GqlJcrNode;
import org.jahia.modules.graphql.provider.dxm.node.GqlJcrNodeMutation;
import org.jahia.modules.graphql.provider.dxm.node.GqlJcrWrongInputException;
import org.jahia.modules.graphql.provider.dxm.node.NodeQueryExtensions;
import org.jahia.osgi.BundleUtils;
import org.jahia.services.content.*;
import org.jahia.services.scheduler.BackgroundJob;
import org.jahia.services.scheduler.SchedulerService;
import org.osgi.service.cm.Configuration;
import org.osgi.service.cm.ConfigurationAdmin;
import org.quartz.JobDataMap;
import org.quartz.JobDetail;
import org.quartz.SchedulerException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * GraphQL mutation extension that force-publishes a subtree.
 * <p>
 * The mutation deletes the target node in LIVE, then schedules a full publication from EDIT to LIVE.
 * Access is restricted to users having both {@code publish} and {@code site-admin} permissions.
 * A per-node throttle is applied to avoid repeated destructive calls.
 * </p>
 */
@GraphQLTypeExtension(GqlJcrNodeMutation.class)
public final class ForcePublication {

    private GqlJcrNodeMutation nodeMutation;
    private static final Logger logger = LoggerFactory.getLogger(ForcePublication.class);
    private static final String PERMISSION_PUBLISH = "publish";
    private static final String PERMISSION_SITE_ADMIN = "site-admin";
    private static final long DEFAULT_PUBLISH_THROTTLE_MS = 60_000L;
    private static final String THROTTLE_PROPERTY = "forcepublishall.throttle.ms";
    private static final String OSGI_PID = "org.jahia.support.modules.forcePublishAll";
    private static final ConcurrentMap<String, Long> RECENT_PUBLICATIONS = new ConcurrentHashMap<>();

    /**
     * Ensures the mutation is executed against an EDIT workspace node.
     *
     * @param node the GraphQL node wrapper
     * @throws GqlJcrWrongInputException when the node belongs to LIVE workspace
     */
    protected void validateNodeWorkspace(GqlJcrNode node) {
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
     * Force-publishes the selected node subtree.
     * <p>
     * This method:
     * 1) validates user permissions,
     * 2) enforces a per-node throttle window,
     * 3) removes the node in LIVE,
     * 4) schedules a Jahia publication job from EDIT to LIVE.
     * </p>
     *
     * @return {@code true} when the publication job has been scheduled
     * @throws RepositoryException when access checks fail
     */
    @GraphQLField
    @GraphQLName("forcePublish")
    @GraphQLDescription("Force the publication of the whole sub-tree by first deleting everything in live and then republishing the whole sub-tree")
    public Boolean forcePublish() throws RepositoryException {
        final ComplexPublicationService complexPublicationService = BundleUtils.getOsgiService(ComplexPublicationService.class, null);
        final SchedulerService schedulerService = BundleUtils.getOsgiService(SchedulerService.class, null);
        final JCRNodeWrapper nodeToPublish = nodeMutation.getNode().getNode();
        if (nodeToPublish.hasPermission(PERMISSION_PUBLISH) && nodeToPublish.hasPermission(PERMISSION_SITE_ADMIN)) {
            try {
                final String uuid = nodeToPublish.getIdentifier();
                final String path = nodeToPublish.getPath();
                final Set<String> activeLiveLanguagesSet = nodeToPublish.getResolveSite().getActiveLiveLanguages();
                final JCRSessionWrapper session = JCRSessionFactory.getInstance().getCurrentUserSession();
                final long now = System.currentTimeMillis();
                final long throttleMs = getThrottleMs();
                RECENT_PUBLICATIONS.entrySet().removeIf(entry -> (now - entry.getValue()) > throttleMs);
                final Long lastRun = RECENT_PUBLICATIONS.putIfAbsent(uuid, now);
                if (lastRun != null && (now - lastRun) <= throttleMs) {
                    throw new GqlJcrWrongInputException("Force publish already triggered recently for path: " + path);
                }

                logger.info("Force publication of node with UUID: {}, path {}", uuid, path);
                final JobDetail jobDetail = BackgroundJob.createJahiaJob("Publication", PublicationJob.class);
                final JobDataMap jobDataMap = jobDetail.getJobDataMap();
                JCRTemplate.getInstance().doExecuteWithSystemSessionAsUser(session.getUser(), Constants.LIVE_WORKSPACE, null, sessionWrapper -> {
                    final JCRNodeWrapper node = sessionWrapper.getNodeByUUID(uuid);
                    if (node != null) {
                        if (!node.hasPermission(PERMISSION_PUBLISH)) {
                            throw new AccessDeniedException(PERMISSION_PUBLISH);
                        }
                        if (!node.hasPermission(PERMISSION_SITE_ADMIN)) {
                            throw new AccessDeniedException(PERMISSION_SITE_ADMIN);
                        }
                        node.remove();
                        sessionWrapper.save();
                        logger.info("Deleted node with UUID: {}, path {} in live workspace", uuid, path);
                    }
                    return null;
                });
                final Collection<ComplexPublicationService.FullPublicationInfo> fullPublicationInfos = complexPublicationService.getFullPublicationInfos(Collections.singletonList(uuid), activeLiveLanguagesSet, true, session);
                final List<String> allUuids = getAllUuids(fullPublicationInfos);
                jobDataMap.put(PublicationJob.PUBLICATION_UUIDS, allUuids);
                jobDataMap.put(PublicationJob.PUBLICATION_PATHS, Collections.singletonList(path));
                jobDataMap.put(PublicationJob.SOURCE, Constants.EDIT_WORKSPACE);
                jobDataMap.put(PublicationJob.DESTINATION, Constants.LIVE_WORKSPACE);
                jobDataMap.put(PublicationJob.CHECK_PERMISSIONS, true);

                logger.info("Scheduling publication job for node with UUID: {}, path {}, will publish {} nodes in {} languages", uuid, path, allUuids.size(), activeLiveLanguagesSet.size());
                schedulerService.scheduleJobNow(jobDetail);
            } catch (RepositoryException | SchedulerException e) {
                logger.error("Force publication failed", e);
                throw new JahiaRuntimeException(e);
            }

            return true;
        } else {
            throw new AccessDeniedException(PERMISSION_PUBLISH + " and " + PERMISSION_SITE_ADMIN);
        }
    }

    /**
     * Collects all node identifiers to publish from publication analysis results.
     *
     * @param fullPublicationInfo publication analysis entries
     * @return list of node UUIDs to include in the publication job
     */
    private static List<String> getAllUuids(Collection<ComplexPublicationService.FullPublicationInfo> fullPublicationInfo) {
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

    /**
     * Resolves the throttle window in milliseconds.
     * <p>
     * Resolution order:
     * 1) OSGi configuration PID {@code org.jahia.support.modules.forcePublishAll},
     *    key {@code forcepublishall.throttle.ms}
     * 2) JVM system property {@code forcepublishall.throttle.ms}
     * 3) default value ({@value #DEFAULT_PUBLISH_THROTTLE_MS})
     * </p>
     *
     * @return throttle window in milliseconds
     */
    private static long getThrottleMs() {
        String value = null;
        try {
            final ConfigurationAdmin configurationAdmin = BundleUtils.getOsgiService(ConfigurationAdmin.class, null);
            if (configurationAdmin != null) {
                final Configuration configuration = configurationAdmin.getConfiguration(OSGI_PID);
                final Dictionary<String, Object> properties = configuration.getProperties();
                if (properties != null) {
                    final Object raw = properties.get(THROTTLE_PROPERTY);
                    if (raw != null) {
                        value = String.valueOf(raw);
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("Unable to read OSGi config {}", OSGI_PID, e);
        }
        if (value == null) {
            value = System.getProperty(THROTTLE_PROPERTY);
        }
        if (value == null || value.trim().isEmpty()) {
            return DEFAULT_PUBLISH_THROTTLE_MS;
        }
        try {
            final long parsed = Long.parseLong(value.trim());
            return parsed > 0 ? parsed : DEFAULT_PUBLISH_THROTTLE_MS;
        } catch (NumberFormatException e) {
            logger.warn("Invalid {} value: {}, using default {}", THROTTLE_PROPERTY, value, DEFAULT_PUBLISH_THROTTLE_MS);
            return DEFAULT_PUBLISH_THROTTLE_MS;
        }
    }
}
