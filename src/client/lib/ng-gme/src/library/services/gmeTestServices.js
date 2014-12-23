/*globals angular, require*/

'use strict';

var ProjectServiceTestClass = require( './tests/ProjectServiceTest.js' );

angular.module( 'gme.testServices', [] )
    .service( 'projectServiceTest', ProjectServiceTestClass );