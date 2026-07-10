package org.jahia.support.forcepublishall.graphql;

import org.jahia.api.Constants;
import org.jahia.exceptions.JahiaRuntimeException;
import org.jahia.modules.graphql.provider.dxm.node.GqlJcrNode;
import org.jahia.modules.graphql.provider.dxm.node.GqlJcrNodeMutation;
import org.jahia.modules.graphql.provider.dxm.node.GqlJcrWrongInputException;
import org.jahia.services.content.JCRNodeWrapper;
import org.jahia.services.content.JCRSessionWrapper;
import org.jahia.services.content.JCRWorkspaceWrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import javax.jcr.RepositoryException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

/**
 * Unit tests for the {@link ForcePublication} constructor / workspace validation
 * ({@code validateNodeWorkspace}).
 *
 * <p>Spec IDs: S14a (LIVE-workspace guard) and S14b (RepositoryException wrapping).
 * The guard fires at construction time, before any OSGi-service or permission check,
 * so these tests need no static mocking at all — only the plain mock chain
 * {@code GqlJcrNodeMutation -> GqlJcrNode -> JCRNodeWrapper -> JCRSessionWrapper -> JCRWorkspaceWrapper}.
 */
@ExtendWith(MockitoExtension.class)
class ForcePublicationConstructorTest {

    @Mock
    private GqlJcrNodeMutation nodeMutation;

    @Mock
    private GqlJcrNode gqlJcrNode;

    @Mock
    private JCRNodeWrapper nodeWrapper;

    @Mock
    private JCRSessionWrapper session;

    @Mock
    private JCRWorkspaceWrapper workspace;

    @BeforeEach
    void setUp() {
        when(nodeMutation.getNode()).thenReturn(gqlJcrNode);
        when(gqlJcrNode.getNode()).thenReturn(nodeWrapper);
    }

    @Test
    @DisplayName("constructor throws GqlJcrWrongInputException when the node session workspace is LIVE")
    void constructor_liveWorkspaceNode_throwsWrongInputException() throws RepositoryException {
        // Arrange: the node's session belongs to the LIVE workspace, not EDIT ("default").
        when(nodeWrapper.getSession()).thenReturn(session);
        when(session.getWorkspace()).thenReturn(workspace);
        when(workspace.getName()).thenReturn(Constants.LIVE_WORKSPACE);

        // Act
        GqlJcrWrongInputException exception = assertThrows(
                GqlJcrWrongInputException.class,
                () -> new ForcePublication(nodeMutation));

        // Assert: the guard names the only supported workspace.
        assertTrue(exception.getMessage().contains("Publication fields can only be used with nodes from"),
                "Guard message must explain the workspace restriction, was: " + exception.getMessage());
        assertTrue(exception.getMessage().contains("EDIT"),
                "Guard message must name the EDIT workspace, was: " + exception.getMessage());
    }

    @Test
    @DisplayName("constructor accepts a node whose session workspace is EDIT (default)")
    void constructor_editWorkspaceNode_succeeds() throws RepositoryException {
        // Arrange
        when(nodeWrapper.getSession()).thenReturn(session);
        when(session.getWorkspace()).thenReturn(workspace);
        when(workspace.getName()).thenReturn(Constants.EDIT_WORKSPACE);

        // Act + Assert: no exception — the EDIT workspace passes validation.
        assertDoesNotThrow(() -> new ForcePublication(nodeMutation));
    }

    @Test
    @DisplayName("constructor wraps a RepositoryException from session access in JahiaRuntimeException")
    void constructor_sessionAccessFails_wrapsInJahiaRuntimeException() throws RepositoryException {
        // Arrange: reading the session itself blows up.
        RepositoryException cause = new RepositoryException("session access failed");
        when(nodeWrapper.getSession()).thenThrow(cause);

        // Act
        JahiaRuntimeException exception = assertThrows(
                JahiaRuntimeException.class,
                () -> new ForcePublication(nodeMutation));

        // Assert: the original RepositoryException is preserved as the cause.
        assertSame(cause, exception.getCause(),
                "The RepositoryException must be kept as the cause of the JahiaRuntimeException");
    }
}
