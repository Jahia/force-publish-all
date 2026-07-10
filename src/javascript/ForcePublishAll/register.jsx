import React from 'react';
import {registry} from '@jahia/ui-extender';
import {CloudUpload} from '@jahia/moonstone';
import {ForcePublishAllActionComponent} from './ForcePublishAllComponent';

export default function () {
    registry.add('action', 'forcePublishAll', {
        buttonIcon: <CloudUpload/>,
        buttonLabel: 'forcePublishAll:label.action.forcePublishAll',
        buttonLabelShort: 'forcePublishAll:label.action.forcePublishAll',
        targets: ['publishMenu:99'],
        component: ForcePublishAllActionComponent
    });
}
