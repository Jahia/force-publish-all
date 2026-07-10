import i18next from 'i18next';
import {registry} from '@jahia/ui-extender';
import register from './ForcePublishAll/register';

export default function () {
    // Explicitly trigger loading of this module's translation namespace on the shared
    // (singleton) i18next instance. jContent's menu-item renderer calls i18n.t() directly
    // (not through the useTranslation() Suspense hook), so it never lazily triggers an HTTP
    // fetch for a namespace it hasn't seen before — without this call the 'forcePublishAll'
    // namespace is simply never requested and the action's buttonLabel key never resolves
    // (verified: SUPPORT-646 execution/bugfix reports).
    i18next.loadNamespaces('forcePublishAll');

    registry.add('callback', 'forcePublishAll', {
        targets: ['jahiaApp-init:50'],
        callback: register
    });
}

console.debug('%c Force publish all is activated', 'color: #3c8cba');
