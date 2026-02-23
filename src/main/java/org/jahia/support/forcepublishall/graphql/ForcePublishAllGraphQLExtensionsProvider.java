package org.jahia.support.forcepublishall.graphql;

import org.jahia.modules.graphql.provider.dxm.DXGraphQLExtensionsProvider;
import org.osgi.service.component.annotations.Component;

import java.util.Collection;
import java.util.Collections;

/**
 * OSGi provider that registers GraphQL DXM extensions for this module.
 */
@Component(service = DXGraphQLExtensionsProvider.class, immediate = true)
public class ForcePublishAllGraphQLExtensionsProvider implements DXGraphQLExtensionsProvider {

    /**
     * Returns GraphQL extension classes contributed by this module.
     *
     * @return singleton collection containing {@link ForcePublication}
     */
    @Override
    public Collection<Class<?>> getExtensions() {
        return Collections.<Class<?>>singletonList(ForcePublication.class);
    }
}
