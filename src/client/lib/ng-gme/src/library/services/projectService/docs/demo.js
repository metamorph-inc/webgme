/*globals angular*/
'use strict';

var demoApp = angular.module( 'gme.projectService.demo', [
    'gme.services',
    'gme.testServices'
] );

demoApp.controller( 'ProjectServiceDemoController', function ( $scope, $log, $q, dataStoreService, projectService,
    projectServiceTest ) {
    $scope.projects = [];
    $scope.tags = [];
    projectServiceTest.startTest()
        .then( function () {
            projectService.getProjects( 'multi' )
                .then( function ( results ) {
                    $scope.projects = results;
                }, function ( err ) {
                    console.log( 'Cannot get projects: ' + err );
                } );

            projectService.getAvailableProjectTags( 'multi' )
                .then( function ( results ) {
                    $scope.tags = results;
                }, function ( err ) {
                    console.log( 'Cannot get tags: ' + err );
                } );


        } );


    /*var a = projectServiceTest.startTest();
   a.then(function(){
   console.log('start: ' + 1);
   projectService.getProjects('multi').then(function(results){
   console.log('ended: ' + 1);
   });
   }, function(){console.log('cannot start: ' + 1);});

   var b = projectServiceTest.startTest();
   b.then(function(){
   console.log('start: ' + 2);
   projectService.getProjects('multi').then(function(results){
   console.log('ended: ' + 2);
   });
   }, function(){console.log('cannot start: ' + 2);});

   var c = projectServiceTest.startTest();
   c.then(function(){
   console.log('start: ' + 3);
   projectService.getProjects('multi').then(function(results){
   console.log('ended: ' + 3);
   });
   }, function(){console.log('cannot start: ' + 3);});*/

} );