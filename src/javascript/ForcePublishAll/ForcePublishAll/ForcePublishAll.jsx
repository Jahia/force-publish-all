import React, {useEffect, useMemo, useRef} from 'react';
import PropTypes from 'prop-types';
import {Dialog, DialogActions, DialogContent, DialogTitle} from '@material-ui/core';
import {Button} from '@jahia/moonstone';
import {useTranslation} from 'react-i18next';

const TITLE_ID = 'force-publish-all-title';
const DESC_ID = 'force-publish-all-description';
const PATH_ID = 'force-publish-all-path';

const ForcePublishAll = ({onClose, onConfirm, onExit, isOpen, path, isLoading, status}) => {
    const {t} = useTranslation('force-publish-all');

    // Capture the element that had focus when the dialog opened so we can
    // restore focus to it once the dialog is dismissed (WCAG 2.2 focus management).
    const triggerRef = useRef(null);
    useEffect(() => {
        if (isOpen && !triggerRef.current) {
            triggerRef.current = document.activeElement;
        }
    }, [isOpen]);

    const restoreFocus = () => {
        if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
            triggerRef.current.focus();
        }

        triggerRef.current = null;
        onExit();
    };

    // Honor prefers-reduced-motion for the dialog transition.
    const prefersReducedMotion = useMemo(
        () => typeof window !== 'undefined' &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        []
    );

    let statusMessage = '';
    if (status === 'success') {
        statusMessage = t('dialog.success');
    } else if (status === 'error') {
        statusMessage = t('dialog.error');
    }

    return (
        <Dialog
            fullWidth
            open={isOpen}
            role="alertdialog"
            aria-labelledby={TITLE_ID}
            aria-describedby={`${DESC_ID} ${PATH_ID}`}
            transitionDuration={prefersReducedMotion ? 0 : undefined}
            data-cm-role="force-publish-dialog"
            onExited={restoreFocus}
            onClose={onClose}
        >
            <DialogTitle id={TITLE_ID}>
                {t('dialog.title')}
            </DialogTitle>
            <DialogContent>
                <p id={DESC_ID}>
                    {t('dialog.consequence')}
                </p>
                <p id={PATH_ID}>
                    {t('dialog.path', {path})}
                </p>
                <output aria-live="polite" aria-atomic="true">
                    {statusMessage}
                </output>
            </DialogContent>
            <DialogActions>
                <Button type="button" size="big" label={t('dialog.cancel')} onClick={onClose}/>
                <Button
                    type="button"
                    size="big"
                    color="accent"
                    data-cm-role="force-publish-button"
                    label={t('dialog.confirm')}
                    disabled={isLoading}
                    aria-busy={isLoading}
                    onClick={onConfirm}
                />
            </DialogActions>
        </Dialog>
    );
};

ForcePublishAll.propTypes = {
    onClose: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
    onExit: PropTypes.func.isRequired,
    isOpen: PropTypes.bool.isRequired,
    path: PropTypes.string.isRequired,
    isLoading: PropTypes.bool,
    status: PropTypes.oneOf(['success', 'error', null])
};

ForcePublishAll.defaultProps = {
    isLoading: false,
    status: null
};

export default ForcePublishAll;
