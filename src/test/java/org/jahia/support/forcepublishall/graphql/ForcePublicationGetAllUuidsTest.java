package org.jahia.support.forcepublishall.graphql;

import org.jahia.services.content.ComplexPublicationService;
import org.jahia.services.content.PublicationInfo;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link ForcePublication#getAllUuids(Collection)}.
 *
 * <p>{@code getAllUuids} is package-private (reduced from private) to allow direct testing
 * without reflection, per the comment in the production code. It contains the core UUID
 * collection logic that determines which nodes the publication job will process, making it
 * the highest-value unit to cover without an OSGi container.
 */
@ExtendWith(MockitoExtension.class)
class ForcePublicationGetAllUuidsTest {

    @Mock
    private ComplexPublicationService.FullPublicationInfo infoModified;

    @Mock
    private ComplexPublicationService.FullPublicationInfo infoDeleted;

    @Mock
    private ComplexPublicationService.FullPublicationInfo infoWithTranslation;

    @Mock
    private ComplexPublicationService.FullPublicationInfo infoWithDeletedTranslations;

    @Mock
    private ComplexPublicationService.FullPublicationInfo infoWithNullIdentifiers;

    // -------------------------------------------------------------------------
    // Empty / trivial inputs
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("getAllUuids returns empty list for empty input")
    void getAllUuids_emptyCollection_returnsEmptyList() {
        List<String> result = ForcePublication.getAllUuids(Collections.emptyList());
        assertTrue(result.isEmpty(), "Expected empty result for empty input");
    }

    // -------------------------------------------------------------------------
    // DELETED status — node must be excluded entirely
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("getAllUuids skips nodes with DELETED publication status")
    void getAllUuids_deletedStatus_nodeExcluded() {
        when(infoDeleted.getPublicationStatus()).thenReturn(PublicationInfo.DELETED);

        List<String> result = ForcePublication.getAllUuids(Collections.singletonList(infoDeleted));

        assertTrue(result.isEmpty(), "DELETED nodes must be excluded from the UUID list");
    }

    @Test
    @DisplayName("getAllUuids excludes DELETED node but includes non-DELETED node in same collection")
    void getAllUuids_mixedStatuses_onlyNonDeletedIncluded() {
        when(infoDeleted.getPublicationStatus()).thenReturn(PublicationInfo.DELETED);

        when(infoModified.getPublicationStatus()).thenReturn(PublicationInfo.MODIFIED);
        when(infoModified.getNodeIdentifier()).thenReturn("uuid-modified");
        when(infoModified.getTranslationNodeIdentifier()).thenReturn(null);
        when(infoModified.getDeletedTranslationNodeIdentifiers()).thenReturn(null);

        List<String> result = ForcePublication.getAllUuids(Arrays.asList(infoDeleted, infoModified));

        assertEquals(Collections.singletonList("uuid-modified"), result);
    }

    // -------------------------------------------------------------------------
    // Non-DELETED node — base node identifier
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("getAllUuids includes node identifier for non-DELETED node")
    void getAllUuids_nonDeletedWithNodeIdentifier_included() {
        when(infoModified.getPublicationStatus()).thenReturn(PublicationInfo.MODIFIED);
        when(infoModified.getNodeIdentifier()).thenReturn("uuid-node-1");
        when(infoModified.getTranslationNodeIdentifier()).thenReturn(null);
        when(infoModified.getDeletedTranslationNodeIdentifiers()).thenReturn(null);

        List<String> result = ForcePublication.getAllUuids(Collections.singletonList(infoModified));

        assertEquals(Collections.singletonList("uuid-node-1"), result);
    }

    @Test
    @DisplayName("getAllUuids skips null node identifier")
    void getAllUuids_nullNodeIdentifier_skipped() {
        when(infoWithNullIdentifiers.getPublicationStatus()).thenReturn(PublicationInfo.NOT_PUBLISHED);
        when(infoWithNullIdentifiers.getNodeIdentifier()).thenReturn(null);
        when(infoWithNullIdentifiers.getTranslationNodeIdentifier()).thenReturn(null);
        when(infoWithNullIdentifiers.getDeletedTranslationNodeIdentifiers()).thenReturn(null);

        List<String> result = ForcePublication.getAllUuids(Collections.singletonList(infoWithNullIdentifiers));

        assertTrue(result.isEmpty(), "Null node identifier must not be added to the list");
    }

    // -------------------------------------------------------------------------
    // Translation node identifier
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("getAllUuids includes translation node identifier when present")
    void getAllUuids_withTranslationNodeIdentifier_included() {
        when(infoWithTranslation.getPublicationStatus()).thenReturn(PublicationInfo.MODIFIED);
        when(infoWithTranslation.getNodeIdentifier()).thenReturn("uuid-node-2");
        when(infoWithTranslation.getTranslationNodeIdentifier()).thenReturn("uuid-translation-2");
        when(infoWithTranslation.getDeletedTranslationNodeIdentifiers()).thenReturn(null);

        List<String> result = ForcePublication.getAllUuids(Collections.singletonList(infoWithTranslation));

        assertEquals(Arrays.asList("uuid-node-2", "uuid-translation-2"), result);
    }

    @Test
    @DisplayName("getAllUuids skips null translation node identifier")
    void getAllUuids_nullTranslationNodeIdentifier_skipped() {
        when(infoWithNullIdentifiers.getPublicationStatus()).thenReturn(PublicationInfo.NOT_PUBLISHED);
        when(infoWithNullIdentifiers.getNodeIdentifier()).thenReturn("uuid-node-null-trans");
        when(infoWithNullIdentifiers.getTranslationNodeIdentifier()).thenReturn(null);
        when(infoWithNullIdentifiers.getDeletedTranslationNodeIdentifiers()).thenReturn(null);

        List<String> result = ForcePublication.getAllUuids(Collections.singletonList(infoWithNullIdentifiers));

        assertEquals(Collections.singletonList("uuid-node-null-trans"), result);
    }

    // -------------------------------------------------------------------------
    // Deleted translation identifiers
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("getAllUuids includes deleted translation node identifiers")
    void getAllUuids_withDeletedTranslationIdentifiers_included() {
        when(infoWithDeletedTranslations.getPublicationStatus()).thenReturn(PublicationInfo.MODIFIED);
        when(infoWithDeletedTranslations.getNodeIdentifier()).thenReturn("uuid-node-3");
        when(infoWithDeletedTranslations.getTranslationNodeIdentifier()).thenReturn(null);
        when(infoWithDeletedTranslations.getDeletedTranslationNodeIdentifiers())
                .thenReturn(Arrays.asList("uuid-del-trans-en", "uuid-del-trans-fr"));

        List<String> result = ForcePublication.getAllUuids(Collections.singletonList(infoWithDeletedTranslations));

        assertEquals(Arrays.asList("uuid-node-3", "uuid-del-trans-en", "uuid-del-trans-fr"), result);
    }

    @Test
    @DisplayName("getAllUuids handles null deleted translation identifiers list gracefully")
    void getAllUuids_nullDeletedTranslationIdentifiers_skipped() {
        when(infoWithNullIdentifiers.getPublicationStatus()).thenReturn(PublicationInfo.MODIFIED);
        when(infoWithNullIdentifiers.getNodeIdentifier()).thenReturn("uuid-node-no-del-trans");
        when(infoWithNullIdentifiers.getTranslationNodeIdentifier()).thenReturn(null);
        when(infoWithNullIdentifiers.getDeletedTranslationNodeIdentifiers()).thenReturn(null);

        List<String> result = ForcePublication.getAllUuids(Collections.singletonList(infoWithNullIdentifiers));

        assertEquals(Collections.singletonList("uuid-node-no-del-trans"), result);
    }

    // -------------------------------------------------------------------------
    // Combined: all identifier types present for a single non-DELETED node
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("getAllUuids collects node, translation, and deleted-translation UUIDs for non-DELETED node")
    void getAllUuids_allIdentifiersPresent_allCollected() {
        when(infoWithTranslation.getPublicationStatus()).thenReturn(PublicationInfo.NOT_PUBLISHED);
        when(infoWithTranslation.getNodeIdentifier()).thenReturn("uuid-main");
        when(infoWithTranslation.getTranslationNodeIdentifier()).thenReturn("uuid-trans");
        when(infoWithTranslation.getDeletedTranslationNodeIdentifiers())
                .thenReturn(Arrays.asList("uuid-del-1", "uuid-del-2"));

        List<String> result = ForcePublication.getAllUuids(Collections.singletonList(infoWithTranslation));

        assertEquals(Arrays.asList("uuid-main", "uuid-trans", "uuid-del-1", "uuid-del-2"), result);
    }

    // -------------------------------------------------------------------------
    // Order preservation with multiple non-DELETED nodes
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("getAllUuids preserves insertion order across multiple non-DELETED infos")
    void getAllUuids_multipleNonDeletedInfos_orderPreserved() {
        when(infoModified.getPublicationStatus()).thenReturn(PublicationInfo.MODIFIED);
        when(infoModified.getNodeIdentifier()).thenReturn("uuid-A");
        when(infoModified.getTranslationNodeIdentifier()).thenReturn("uuid-A-trans");
        when(infoModified.getDeletedTranslationNodeIdentifiers()).thenReturn(null);

        when(infoWithTranslation.getPublicationStatus()).thenReturn(PublicationInfo.NOT_PUBLISHED);
        when(infoWithTranslation.getNodeIdentifier()).thenReturn("uuid-B");
        when(infoWithTranslation.getTranslationNodeIdentifier()).thenReturn(null);
        when(infoWithTranslation.getDeletedTranslationNodeIdentifiers()).thenReturn(null);

        List<String> result = ForcePublication.getAllUuids(Arrays.asList(infoModified, infoWithTranslation));

        assertEquals(Arrays.asList("uuid-A", "uuid-A-trans", "uuid-B"), result);
    }
}
