/*globals angular*/
'use strict';

require( './projectBrowser/projectBrowser.js' );

angular.module( 'gme.directives', [
    'gme.templates',
    'gme.directives.projectBrowser'
] );