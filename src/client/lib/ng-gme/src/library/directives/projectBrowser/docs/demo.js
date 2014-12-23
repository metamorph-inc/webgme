/*globals angular*/
'use strict';

var demoApp = angular.module( 'gme.projectBrowser.demo', [ 'gme.directives.projectBrowser' ] );

demoApp.controller( 'ProjectBrowserDemoController', function ( $scope, $log ) {
    $log.debug( 'In ProjectBrowserDemoController' );
} );