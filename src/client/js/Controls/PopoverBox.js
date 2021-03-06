/*globals define */
/*jshint browser: true*/
/**
 * @author rkereskenyi / https://github.com/rkereskenyi
 */


define(['jquery', 'css!./styles/PopoverBox.css'], function () {

    'use strict';

    var PopoverBox,
        AUTO_HIDE_MILLISEC = 2000;

    PopoverBox = function (el) {
        this._el = el;
    };

    PopoverBox.prototype.show = function (message, alertLevel, autoHideOrDelay) {
        var el = this._el,
            autoHide = autoHideOrDelay === true || autoHideOrDelay > 0;

        if (autoHideOrDelay === true) {
            autoHideOrDelay = AUTO_HIDE_MILLISEC;
        }

        el.addClass('pobox');

        //remove existing
        el.popover('destroy');

        //show new
        el.popover({
            placement: 'top',
            content: message,
            container: this._el
        });

        el.popover('show');
        el.find('.popover').addClass('pobox');
        el.popover('show');

        if (alertLevel) {
            el.find('.popover').addClass(alertLevel);
        }

        if (autoHide === true) {
            setTimeout(function () {
                el.popover('destroy');
            }, autoHideOrDelay);
        }
    };

    PopoverBox.prototype.alertLevels = {
        SUCCESS: 'ddwa-success',
        WARNING: 'ddwa-warning',
        ERROR: 'ddwa-error',
        INFO: 'ddwa-info'
    };

    return PopoverBox;
});