import React from 'react';
import PropTypes from 'prop-types';
import {Dialog, DialogActions, DialogContent, DialogTitle, FormHelperText} from '@material-ui/core';
import {Button} from '@jahia/moonstone';

const ForcePublishAll = ({onClose, onExit, isOpen, path}) => {
    return (
            <Dialog fullWidth open={isOpen} aria-labelledby="form-dialog-title" data-cm-role="export-options" onExited={onExit} onClose={onExit}>
                <DialogTitle>
                    Force Publish All
                </DialogTitle>
                <DialogContent>
                    <FormHelperText>
                        {path}
                    </FormHelperText>
                </DialogContent>
                <DialogActions>
                    <Button size="big" label="Cancel" onClick={onExit}/>
                    <Button
                        size="big"
                        color="accent"
                        data-cm-role="export-button"
                        label="Force Publish"
                        onClick={() => {
                            onClose();
                        }}
                    />
                </DialogActions>
            </Dialog>
        );
}

ForcePublishAll.propTypes = {
    onClose: PropTypes.func.isRequired,
    onExit: PropTypes.func.isRequired,
    isOpen: PropTypes.bool.isRequired,
    path: PropTypes.string.isRequired
};

export default ForcePublishAll;
