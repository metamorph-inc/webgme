/*
 * Copyright (C) 2013 Vanderbilt University, All rights reserved.
 *
 * Author: Robert Kereskenyi
 */

"use strict";

define(['jquery',
        'js/Constants',
        'js/NodePropertyNames'], function (_jquery,
                                           CONSTANTS,
                                           nodePropertyNames) {

    var _client;

    var _initialize = function (c) {
        //if already initialized, just return
        if (!_client) {
            _client = c;
        }
    };

    var _export = function (objID) {
        var fileName =  _client.getActiveProject() + "_" + _client.getActualBranch(),
            objName;

        if (objID !== CONSTANTS.PROJECT_ROOT_ID) {
            var obj = _client.getNode(objID);

            if (obj) {
                objName = obj.getAttribute(nodePropertyNames.Attributes.name);
            }

            if (!objName || objName === '') {
                objName = objID;
            }

            fileName += '_' + objName;
        }

        window.location = _client.getDumpURL(objID, fileName);
    };

    //return utility functions
    return { initialize: _initialize,
        export: _export
    };
});