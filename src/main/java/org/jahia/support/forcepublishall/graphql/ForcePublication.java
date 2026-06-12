package org.jahia.support.forcepublishall.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
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
import org.quartz.JobDataMap;
import org.quartz.JobDetail;
import org.quartz.SchedulerException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.jcr.AccessDeniedException;
import javax.jcr.RepositoryException;
import java.util.*;

@GraphQLTypeExtension(GqlJcrNodeMutation.class)
public final class ForcePublication {

    private GqlJcrNodeMutation nodeMutation;
    private static final Logger logger = LoggerFactory.getLogger(ForcePublication.class);
    private static final String PERMISSION_PUBLISH = "publish";

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
     * Root search mutation for indexing of the sites
     *
     * @return admin mutation result object
     */
    @GraphQLField
    @GraphQLName("forcePublish")
    @GraphQLDescription("Force the publication of the whole sub-tree by first deleting everything in live and then republishing the whole sub-tree")
    public Boolean forcePublish() throws RepositoryException {
        final ComplexPublicationService complexPublicationService = BundleUtils.getOsgiService(ComplexPublicationService.class, null);
        final SchedulerService schedulerService = BundleUtils.getOsgiService(SchedulerService.class, null);
        final JCRNodeWrapper nodeToPublish = nodeMutation.getNode().getNode();
        if (nodeToPublish.hasPermission(PERMISSION_PUBLISH)) {
            try {
                final String uuid = nodeToPublish.getIdentifier();
                final String path = nodeToPublish.getPath();
                final Set<String> activeLiveLanguagesSet = nodeToPublish.getResolveSite().getActiveLiveLanguages();
                final JCRSessionWrapper session = JCRSessionFactory.getInstance().getCurrentUserSession();

                logger.info("Force publication of node with UUID: {}, path {}", uuid, path);
                final JobDetail jobDetail = BackgroundJob.createJahiaJob("Publication", PublicationJob.class);
                final JobDataMap jobDataMap = jobDetail.getJobDataMap();
                JCRTemplate.getInstance().doExecuteWithSystemSessionAsUser(null, Constants.LIVE_WORKSPACE, null, sessionWrapper -> {
                    try {
                        final JCRNodeWrapper node = sessionWrapper.getNodeByUUID(uuid);
                        if (node != null) {
                            node.remove();
                            sessionWrapper.save();
                            logger.info("Deleted node with UUID: {}, path {} in live workspace", uuid, path);
                        }
                    } catch (RepositoryException ex) {
                        // ignore silently the exception
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
                logger.error(PERMISSION_PUBLISH);
                throw new JahiaRuntimeException(e);
            }

            return true;
        } else {
            throw new AccessDeniedException(PERMISSION_PUBLISH);
        }
    }

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
}
