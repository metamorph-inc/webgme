'use strict';

module.exports = function () {

    var config = {};

    this.getAttribute = function ( key ) {
        return config[ key ];
    };

};