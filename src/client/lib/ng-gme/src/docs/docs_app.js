/*globals angular, require, Chance*/
'use strict';

var directiveComponents, serviceComponents;

directiveComponents = [ {
    name: 'projectBrowser',
    sources: [ 'demo.html', 'demo.js' ]
} ];

serviceComponents = [ {
    name: 'projectService',
    sources: [ 'demo.html', 'demo.js' ]
} ];

window.chance = new Chance();

require( '../library/ng-gme.js' );
require( '../library/directives/projectBrowser/docs/demo.js' );
require( '../library/services/projectService/docs/demo.js' );


require( 'angular-sanitize' );
window.Showdown = require( 'showdown' );
require( 'angular-markdown-directive' );

require( 'codemirror-css' );
window.CodeMirror = require( 'codemirror' );

require( 'codemirror/mode/htmlmixed/htmlmixed' );
require( 'codemirror/mode/xml/xml' );
require( 'codemirror/mode/javascript/javascript' );

require( 'angular-ui-codemirror' );
//require( 'ng-grid' );
//require( 'ng-grid-css');
require( 'ui-utils' );


var demoApp = angular.module(
    'gme.demoApp', [
        'gme.docs.templates',
        'btford.markdown',
        'ui.codemirror',
        'ui.bootstrap'
    ].concat( directiveComponents.map( function ( e ) {
        return 'gme.' + e.name + '.demo';
    } ) )
    .concat( serviceComponents.map( function ( e ) {
        return 'gme.' + e.name + '.demo';
    } ) )
);

demoApp.run( function () {
    console.log( 'DemoApp run...' );

} );

demoApp.controller(
    'UIComponentsDemoController',
    function ( $scope, $templateCache ) {

        var fileExtensionRE,
            codeMirrorModes;

        fileExtensionRE = /(?:\.([^.]+))?$/;

        codeMirrorModes = {
            'js': 'javascript',
            'html': 'htmlmixed'
        };

        $scope.components = directiveComponents.map( function ( component ) {
            var sources,
                viewerOptions,
                fileExtension;

            if ( angular.isArray( component.sources ) ) {
                sources = component.sources.map( function ( sourceFile ) {

                    fileExtension = fileExtensionRE.exec( sourceFile );

                    viewerOptions = {
                        lineWrapping: true,
                        lineNumbers: true,
                        readOnly: true,
                        mode: codeMirrorModes[ fileExtension[ 1 ] ] || 'xml'
                    };

                    return {
                        fileName: sourceFile,
                        code: $templateCache.get( '/library/directives/' + component.name + '/docs/' +
                            sourceFile ),
                        viewerOptions: viewerOptions
                    };
                } );
            }

            return {
                name: component.name,
                template: '/library/directives/' + component.name + '/docs/demo.html',
                docs: '/library/directives/' + component.name + '/docs/readme.md',
                sources: sources
            };
        } );

        $scope.components = $scope.components.concat( serviceComponents.map( function ( component ) {
            var sources,
                viewerOptions,
                fileExtension;

            if ( angular.isArray( component.sources ) ) {
                sources = component.sources.map( function ( sourceFile ) {

                    fileExtension = fileExtensionRE.exec( sourceFile );

                    viewerOptions = {
                        lineWrapping: true,
                        lineNumbers: true,
                        readOnly: true,
                        mode: codeMirrorModes[ fileExtension[ 1 ] ] || 'xml'
                    };

                    return {
                        fileName: sourceFile,
                        code: $templateCache.get( '/library/services/' + component.name + '/docs/' +
                            sourceFile ),
                        viewerOptions: viewerOptions
                    };
                } );
            }

            return {
                name: component.name,
                template: '/library/services/' + component.name + '/docs/demo.html',
                docs: '/library/services/' + component.name + '/docs/readme.md',
                sources: sources
            };
        } ) );
    } );


demoApp.controller( '' );