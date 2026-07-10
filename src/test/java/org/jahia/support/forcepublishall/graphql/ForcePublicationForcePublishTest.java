package org.jahia.support.forcepublishall.graphql;

import org.jahia.api.Constants;
import org.jahia.exceptions.JahiaRuntimeException;
import org.jahia.modules.graphql.provider.dxm.DataFetchingException;
import org.jahia.modules.graphql.provider.dxm.node.GqlJcrNode;
import org.jahia.modules.graphql.provider.dxm.node.GqlJcrNodeMutation;
import org.jahia.osgi.BundleUtils;
import org.jahia.services.content.ComplexPublicationService;
import org.jahia.services.content.JCRCallback;
import org.jahia.services.content.JCRNodeWrapper;
import org.jahia.services.content.JCRSessionFactory;
import org.jahia.services.content.JCRSessionWrapper;
import org.jahia.services.content.JCRTemplate;
import org.jahia.services.content.JCRWorkspaceWrapper;
import org.jahia.services.content.PublicationInfo;
import org.jahia.services.content.PublicationJob;
import org.jahia.services.content.decorator.JCRSiteNode;
import org.jahia.services.scheduler.BackgroundJob;
import org.jahia.services.scheduler.SchedulerService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.quartz.JobDataMap;
import org.quartz.JobDetail;
import org.quartz.SchedulerException;

import javax.jcr.InvalidItemStateException;
import javax.jcr.ItemNotFoundException;
import javax.jcr.RepositoryException;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link ForcePublication#forcePublish()}.
 *
 * <p>Spec IDs: S14/S15 (OSGi-service fail-fast guards), S15a/S15b (permission guards and
 * their ordering), S16 (silent skip when the node is absent from LIVE), S17 (abort when the
 * live delete fails), S18 (PublicationJob payload contract), S19/S20 (outer catch-all).
 *
 * <p>Static mocking (Mockito inline mock-maker, default in mockito-core 5.x):
 * {@link BundleUtils} for the guard tests, plus {@link JCRSessionFactory},
 * {@link JCRTemplate} and {@link BackgroundJob} for the happy-path scaffold.
 * {@code BackgroundJob.createJahiaJob} is static-mocked to return a plain
 * {@link JobDetail} because the real implementation reads the current user from
 * {@link JCRSessionFactory} and cannot run outside a container.
 */
@ExtendWith(MockitoExtension.class)
class ForcePublicationForcePublishTest {

    private static final String NODE_UUID = "11111111-2222-3333-4444-555555555555";
    private static final String NODE_PATH = "/sites/x/home";

    @Mock
    private GqlJcrNodeMutation nodeMutation;

    @Mock
    private GqlJcrNode gqlJcrNode;

    @Mock
    private JCRNodeWrapper nodeToPublish;

    @Mock
    private JCRSessionWrapper editSession;

    @Mock
    private JCRWorkspaceWrapper workspace;

    @Mock
    private ComplexPublicationService complexPublicationService;

    @Mock
    private SchedulerService schedulerService;

    @Mock
    private JCRSessionFactory sessionFactory;

    @Mock
    private JCRTemplate jcrTemplate;

    @Mock
    private JCRSessionWrapper liveSession;

    @Mock
    private JCRNodeWrapper liveNode;

    @Mock
    private JCRSiteNode resolveSite;

    @Mock
    private ComplexPublicationService.FullPublicationInfo infoModified;

    @Mock
    private ComplexPublicationService.FullPublicationInfo infoDeleted;

    private MockedStatic<BundleUtils> bundleUtilsStatic;
    private MockedStatic<JCRSessionFactory> sessionFactoryStatic;
    private MockedStatic<JCRTemplate> jcrTemplateStatic;
    private MockedStatic<BackgroundJob> backgroundJobStatic;

    private JobDetail jobDetail;

    @BeforeEach
    void setUp() throws RepositoryException {
        // Constructor chain: the node lives in the EDIT ("default") workspace.
        when(nodeMutation.getNode()).thenReturn(gqlJcrNode);
        when(gqlJcrNode.getNode()).thenReturn(nodeToPublish);
        when(nodeToPublish.getSession()).thenReturn(editSession);
        when(editSession.getWorkspace()).thenReturn(workspace);
        when(workspace.getName()).thenReturn(Constants.EDIT_WORKSPACE);

        bundleUtilsStatic = mockStatic(BundleUtils.class);
    }

    @AfterEach
    void tearDown() {
        if (backgroundJobStatic != null) {
            backgroundJobStatic.close();
            backgroundJobStatic = null;
        }

        if (jcrTemplateStatic != null) {
            jcrTemplateStatic.close();
            jcrTemplateStatic = null;
        }

        if (sessionFactoryStatic != null) {
            sessionFactoryStatic.close();
            sessionFactoryStatic = null;
        }

        bundleUtilsStatic.close();
    }

    // -------------------------------------------------------------------------
    // Arrange helpers
    // -------------------------------------------------------------------------

    private void stubOsgiServicesAvailable() {
        bundleUtilsStatic.when(() -> BundleUtils.getOsgiService(ComplexPublicationService.class, null))
                .thenReturn(complexPublicationService);
        bundleUtilsStatic.when(() -> BundleUtils.getOsgiService(SchedulerService.class, null))
                .thenReturn(schedulerService);
    }

    private void stubPermissionsGranted() {
        when(nodeToPublish.hasPermission("publish")).thenReturn(true);
        when(nodeToPublish.hasPermission("site-admin")).thenReturn(true);
    }

    private Set<String> activeLiveLanguages() {
        return new LinkedHashSet<>(Collections.singletonList("en"));
    }

    /**
     * Full happy-path scaffold shared by S16–S19: OSGi services present, permissions granted,
     * site resolution and current-user session stubbed, {@link JCRTemplate} executing the live
     * callback against {@code liveSession}, and {@link BackgroundJob#createJahiaJob} returning
     * a real {@link JobDetail} with a fresh {@link JobDataMap}.
     */
    private void openHappyPathScaffold() throws RepositoryException {
        stubOsgiServicesAvailable();
        stubPermissionsGranted();
        when(nodeToPublish.getIdentifier()).thenReturn(NODE_UUID);
        when(nodeToPublish.getPath()).thenReturn(NODE_PATH);
        when(nodeToPublish.getResolveSite()).thenReturn(resolveSite);
        when(resolveSite.getActiveLiveLanguages()).thenReturn(activeLiveLanguages());

        sessionFactoryStatic = mockStatic(JCRSessionFactory.class);
        sessionFactoryStatic.when(JCRSessionFactory::getInstance).thenReturn(sessionFactory);
        when(sessionFactory.getCurrentUserSession(Constants.EDIT_WORKSPACE)).thenReturn(editSession);

        jcrTemplateStatic = mockStatic(JCRTemplate.class);
        jcrTemplateStatic.when(JCRTemplate::getInstance).thenReturn(jcrTemplate);
        when(jcrTemplate.doExecuteWithSystemSessionAsUser(isNull(), eq(Constants.LIVE_WORKSPACE), isNull(), any()))
                .thenAnswer(invocation -> ((JCRCallback<?>) invocation.getArgument(3)).doInJCR(liveSession));

        backgroundJobStatic = mockStatic(BackgroundJob.class);
        jobDetail = new JobDetail();
        backgroundJobStatic.when(() -> BackgroundJob.createJahiaJob("Publication", PublicationJob.class))
                .thenReturn(jobDetail);
    }

    private ForcePublication newForcePublication() {
        return new ForcePublication(nodeMutation);
    }

    // -------------------------------------------------------------------------
    // S14 / S15 — OSGi-service fail-fast guards, checked before permissions
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("forcePublish throws when ComplexPublicationService is missing, before any permission check")
    void forcePublish_complexPublicationServiceMissing_failsFastBeforePermissionCheck() {
        // Arrange
        bundleUtilsStatic.when(() -> BundleUtils.getOsgiService(ComplexPublicationService.class, null))
                .thenReturn(null);

        // Act
        JahiaRuntimeException exception = assertThrows(
                JahiaRuntimeException.class,
                () -> newForcePublication().forcePublish());

        // Assert
        assertEquals("Required OSGi service ComplexPublicationService is not available", exception.getMessage());
        verify(nodeToPublish, never()).hasPermission(anyString());
    }

    @Test
    @DisplayName("forcePublish throws when SchedulerService is missing, before any permission check")
    void forcePublish_schedulerServiceMissing_failsFastBeforePermissionCheck() {
        // Arrange
        bundleUtilsStatic.when(() -> BundleUtils.getOsgiService(ComplexPublicationService.class, null))
                .thenReturn(complexPublicationService);
        bundleUtilsStatic.when(() -> BundleUtils.getOsgiService(SchedulerService.class, null))
                .thenReturn(null);

        // Act
        JahiaRuntimeException exception = assertThrows(
                JahiaRuntimeException.class,
                () -> newForcePublication().forcePublish());

        // Assert
        assertEquals("Required OSGi service SchedulerService is not available", exception.getMessage());
        verify(nodeToPublish, never()).hasPermission(anyString());
    }

    // -------------------------------------------------------------------------
    // S15a / S15b — permission guards and their ordering
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("forcePublish throws DataFetchingException naming 'publish' and never checks site-admin")
    void forcePublish_publishPermissionMissing_deniesWithoutCheckingSiteAdmin() throws RepositoryException {
        // Arrange
        stubOsgiServicesAvailable();
        when(nodeToPublish.hasPermission("publish")).thenReturn(false);
        when(nodeToPublish.getPath()).thenReturn(NODE_PATH);

        // Act: DataFetchingException (not a plain AccessDeniedException) so the GraphQL layer
        // forwards the message verbatim to the client instead of masking it as a generic
        // "Internal Server Error(s)" (execution finding, SUPPORT-646, spec S5).
        DataFetchingException exception = assertThrows(
                DataFetchingException.class,
                () -> newForcePublication().forcePublish());

        // Assert: exact message, and 'publish' is checked first (F4 ordering).
        assertEquals("Permission 'publish' is required to force-publish node: " + NODE_PATH, exception.getMessage());
        verify(nodeToPublish, never()).hasPermission("site-admin");
    }

    @Test
    @DisplayName("forcePublish throws DataFetchingException naming 'site-admin' and runs nothing past the guard")
    void forcePublish_siteAdminPermissionMissing_deniesBeforeAnySideEffect() throws RepositoryException {
        // Arrange
        stubOsgiServicesAvailable();
        when(nodeToPublish.hasPermission("publish")).thenReturn(true);
        when(nodeToPublish.hasPermission("site-admin")).thenReturn(false);
        when(nodeToPublish.getPath()).thenReturn(NODE_PATH);

        // Act
        DataFetchingException exception = assertThrows(
                DataFetchingException.class,
                () -> newForcePublication().forcePublish());

        // Assert: exact message, and nothing past the guard ran (UUID never read,
        // no live delete, no job scheduled).
        assertEquals("Permission 'site-admin' is required to force-publish node: " + NODE_PATH, exception.getMessage());
        verify(nodeToPublish, never()).getIdentifier();
        verifyNoInteractions(schedulerService);
    }

    // -------------------------------------------------------------------------
    // S16 — node absent from LIVE: ItemNotFoundException swallowed, job scheduled
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("forcePublish returns true and schedules the job when the node is absent from LIVE")
    void forcePublish_nodeAbsentFromLive_swallowsNotFoundAndSchedulesJob() throws Exception {
        // Arrange
        openHappyPathScaffold();
        when(liveSession.getNodeByUUID(NODE_UUID)).thenThrow(new ItemNotFoundException(NODE_UUID));
        when(complexPublicationService.getFullPublicationInfos(
                eq(Collections.singletonList(NODE_UUID)), eq(activeLiveLanguages()), eq(true), eq(editSession)))
                .thenReturn(Collections.emptyList());

        // Act
        Boolean result = newForcePublication().forcePublish();

        // Assert
        assertEquals(Boolean.TRUE, result);
        verify(schedulerService).scheduleJobNow(any(JobDetail.class));
        verify(liveSession, never()).save();
    }

    @Test
    @DisplayName("forcePublish deletes and saves the existing live node before scheduling the job")
    void forcePublish_nodePresentInLive_deletesItBeforeSchedulingJob() throws Exception {
        // Arrange (complement of S16: the live copy exists and the delete succeeds)
        openHappyPathScaffold();
        when(liveSession.getNodeByUUID(NODE_UUID)).thenReturn(liveNode);
        when(complexPublicationService.getFullPublicationInfos(
                eq(Collections.singletonList(NODE_UUID)), eq(activeLiveLanguages()), eq(true), eq(editSession)))
                .thenReturn(Collections.emptyList());

        // Act
        Boolean result = newForcePublication().forcePublish();

        // Assert: the live copy was removed and saved inside the system session,
        // then the job was scheduled.
        assertEquals(Boolean.TRUE, result);
        verify(liveNode).remove();
        verify(liveSession).save();
        verify(schedulerService).scheduleJobNow(any(JobDetail.class));
    }

    // -------------------------------------------------------------------------
    // S17 — live delete fails: abort, job never scheduled
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("forcePublish aborts and never schedules the job when the live delete fails")
    void forcePublish_liveDeleteFails_abortsWithoutSchedulingJob() throws Exception {
        // Arrange
        openHappyPathScaffold();
        when(liveSession.getNodeByUUID(NODE_UUID)).thenReturn(liveNode);
        doThrow(new RepositoryException("integrity")).when(liveNode).remove();

        // Act: DataFetchingException (a JahiaRuntimeException subtype) so this message also
        // reaches the client verbatim instead of being masked (execution finding, SUPPORT-646,
        // spec S5's investigation).
        DataFetchingException exception = assertThrows(
                DataFetchingException.class,
                () -> newForcePublication().forcePublish());

        // Assert: message carries the UUID, the path and the abort statement.
        assertTrue(exception.getMessage().startsWith("Live-workspace deletion failed for node UUID:"),
                "Unexpected message: " + exception.getMessage());
        assertTrue(exception.getMessage().contains(NODE_UUID));
        assertTrue(exception.getMessage().contains(NODE_PATH));
        assertTrue(exception.getMessage().contains("publication job was not scheduled"));
        verifyNoInteractions(schedulerService);
        verifyNoInteractions(complexPublicationService);
    }

    // -------------------------------------------------------------------------
    // Live-delete retry on transient stale-item conflicts (execution finding,
    // SUPPORT-646, spec 01): a concurrent PublicationJob on an overlapping path can leave
    // the LIVE session transiently stale; forcePublish should refresh and retry a bounded
    // number of times rather than aborting on the first conflict.
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("forcePublish refreshes and retries the live delete after a transient stale-item conflict, then succeeds")
    void forcePublish_liveDeleteStaleItemThenSucceeds_retriesAndSchedulesJob() throws Exception {
        // Arrange: the first remove() attempt hits a stale item, the second succeeds.
        openHappyPathScaffold();
        when(liveSession.getNodeByUUID(NODE_UUID)).thenReturn(liveNode);
        doThrow(new InvalidItemStateException("stale"))
                .doNothing()
                .when(liveNode).remove();
        when(complexPublicationService.getFullPublicationInfos(
                eq(Collections.singletonList(NODE_UUID)), eq(activeLiveLanguages()), eq(true), eq(editSession)))
                .thenReturn(Collections.emptyList());

        // Act
        Boolean result = newForcePublication().forcePublish();

        // Assert: one refresh (for the single retry), the node removed twice (failed + retried
        // attempt), then the job scheduled normally.
        assertEquals(Boolean.TRUE, result);
        verify(liveSession, times(1)).refresh(false);
        verify(liveNode, times(2)).remove();
        verify(liveSession).save();
        verify(schedulerService).scheduleJobNow(any(JobDetail.class));
    }

    @Test
    @DisplayName("forcePublish aborts after exhausting live-delete retries on repeated stale-item conflicts")
    void forcePublish_liveDeleteStaleItemExhaustsRetries_abortsWithoutSchedulingJob() throws Exception {
        // Arrange: every attempt hits a stale item.
        openHappyPathScaffold();
        when(liveSession.getNodeByUUID(NODE_UUID)).thenReturn(liveNode);
        doThrow(new InvalidItemStateException("stale")).when(liveNode).remove();

        // Act
        DataFetchingException exception = assertThrows(
                DataFetchingException.class,
                () -> newForcePublication().forcePublish());

        // Assert: same abort message as any other live-delete failure (S17), exactly 4
        // refreshes (retries before the 5th and final attempt), delete tried 5 times, no job
        // scheduled.
        assertTrue(exception.getMessage().startsWith("Live-workspace deletion failed for node UUID:"),
                "Unexpected message: " + exception.getMessage());
        assertTrue(exception.getMessage().contains(NODE_UUID));
        assertTrue(exception.getMessage().contains(NODE_PATH));
        verify(liveSession, times(4)).refresh(false);
        verify(liveNode, times(5)).remove();
        verify(liveSession, never()).save();
        verifyNoInteractions(schedulerService);
        verifyNoInteractions(complexPublicationService);
    }

    // -------------------------------------------------------------------------
    // S18 — PublicationJob payload contract
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("forcePublish schedules a PublicationJob carrying UUIDS, PATHS, SOURCE, DESTINATION and CHECK_PERMISSIONS=true")
    void forcePublish_success_schedulesJobWithExpectedPayload() throws Exception {
        // Arrange: two publication infos — one MODIFIED (kept, with translation),
        // one DELETED (skipped by getAllUuids).
        openHappyPathScaffold();
        when(liveSession.getNodeByUUID(NODE_UUID)).thenThrow(new ItemNotFoundException(NODE_UUID));
        when(infoModified.getPublicationStatus()).thenReturn(PublicationInfo.MODIFIED);
        when(infoModified.getNodeIdentifier()).thenReturn("uuid-modified");
        when(infoModified.getTranslationNodeIdentifier()).thenReturn("uuid-modified-translation");
        when(infoModified.getDeletedTranslationNodeIdentifiers()).thenReturn(null);
        when(infoDeleted.getPublicationStatus()).thenReturn(PublicationInfo.DELETED);
        // The eq(...) matchers double as the U4 assertion: allSubTree=true and the
        // site's active live languages are what reaches getFullPublicationInfos.
        when(complexPublicationService.getFullPublicationInfos(
                eq(Collections.singletonList(NODE_UUID)), eq(activeLiveLanguages()), eq(true), eq(editSession)))
                .thenReturn(Arrays.asList(infoModified, infoDeleted));

        // Act
        Boolean result = newForcePublication().forcePublish();

        // Assert
        assertEquals(Boolean.TRUE, result);
        ArgumentCaptor<JobDetail> jobCaptor = ArgumentCaptor.forClass(JobDetail.class);
        verify(schedulerService).scheduleJobNow(jobCaptor.capture());
        assertSame(jobDetail, jobCaptor.getValue(), "The job created by BackgroundJob.createJahiaJob must be the one scheduled");

        JobDataMap jobDataMap = jobCaptor.getValue().getJobDataMap();
        assertEquals(Arrays.asList("uuid-modified", "uuid-modified-translation"),
                jobDataMap.get(PublicationJob.PUBLICATION_UUIDS));
        assertEquals(Collections.singletonList(NODE_PATH), jobDataMap.get(PublicationJob.PUBLICATION_PATHS));
        assertEquals(Constants.EDIT_WORKSPACE, jobDataMap.get(PublicationJob.SOURCE));
        assertEquals(Constants.LIVE_WORKSPACE, jobDataMap.get(PublicationJob.DESTINATION));
        assertEquals(Boolean.TRUE, jobDataMap.get(PublicationJob.CHECK_PERMISSIONS));
    }

    // -------------------------------------------------------------------------
    // S19 / S20 — outer catch-all wrapping
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("forcePublish wraps a SchedulerException in JahiaRuntimeException('Force publication failed…')")
    void forcePublish_schedulerFails_wrapsSchedulerException() throws Exception {
        // Arrange
        openHappyPathScaffold();
        when(liveSession.getNodeByUUID(NODE_UUID)).thenThrow(new ItemNotFoundException(NODE_UUID));
        when(complexPublicationService.getFullPublicationInfos(
                eq(Collections.singletonList(NODE_UUID)), eq(activeLiveLanguages()), eq(true), eq(editSession)))
                .thenReturn(Collections.emptyList());
        SchedulerException cause = new SchedulerException("scheduler down");
        doThrow(cause).when(schedulerService).scheduleJobNow(any(JobDetail.class));

        // Act
        JahiaRuntimeException exception = assertThrows(
                JahiaRuntimeException.class,
                () -> newForcePublication().forcePublish());

        // Assert
        assertTrue(exception.getMessage().startsWith("Force publication failed for node UUID:"),
                "Unexpected message: " + exception.getMessage());
        assertTrue(exception.getMessage().contains(NODE_UUID));
        assertTrue(exception.getMessage().contains(NODE_PATH));
        assertSame(cause, exception.getCause());
    }

    @Test
    @DisplayName("forcePublish wraps a site-resolution failure and leaves live untouched, no job scheduled")
    void forcePublish_siteResolutionFails_wrapsExceptionAndLeavesLiveUntouched() throws RepositoryException {
        // Arrange: getResolveSite() runs before the live delete, so a failure here
        // must abort before anything touches the LIVE workspace.
        stubOsgiServicesAvailable();
        stubPermissionsGranted();
        when(nodeToPublish.getIdentifier()).thenReturn(NODE_UUID);
        when(nodeToPublish.getPath()).thenReturn(NODE_PATH);
        RepositoryException cause = new RepositoryException("node is not under a site");
        when(nodeToPublish.getResolveSite()).thenThrow(cause);
        jcrTemplateStatic = mockStatic(JCRTemplate.class);

        // Act
        JahiaRuntimeException exception = assertThrows(
                JahiaRuntimeException.class,
                () -> newForcePublication().forcePublish());

        // Assert
        assertTrue(exception.getMessage().startsWith("Force publication failed for node UUID:"),
                "Unexpected message: " + exception.getMessage());
        assertTrue(exception.getMessage().contains(NODE_UUID));
        assertTrue(exception.getMessage().contains(NODE_PATH));
        assertSame(cause, exception.getCause());
        // Live untouched: the system-session template was never even resolved.
        jcrTemplateStatic.verify(JCRTemplate::getInstance, never());
        verifyNoInteractions(schedulerService);
    }
}
