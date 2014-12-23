'use strict';

require( '../gmeServices.js' );

module.exports = function ( $q, dataStoreService, projectService ) {
    var testProjects = [ {
        projectName: 'ProjectServiceTest1',
        projectInfo: {
            visibleName: 'ProjectServiceTest1',
            description: 'project in webGME',
            tags: {
                tag1: 'Master'
            }
        }
    }, {
        projectName: 'ProjectServiceTest2',
        projectInfo: {
            visibleName: 'ProjectServiceTest2',
            description: 'project in webGME',
            tags: {
                tag1: 'Master'
            }
        }
    } ];

    this.startTest = function () {
        var deferred = new $q.defer(),
            index = 0;

        dataStoreService.connectToDatabase( 'multi', {
            host: window.location.basename
        } )
            .then( function () {
                //projectService.applyTagsOnProject('multi','ProjectServiceTest2',[{id:'t1', name:'alma1'},{id:'t2', name:'korte2'}]);
                //projectService.deleteProject('multi', 'ProjectServiceTest1').then(function() {
                projectService.getAvailableProjects( 'multi' )
                    .then( function ( names ) {
                        if ( names ) {
                            var createProjectPromises = [];

                            for ( index = 0; index < testProjects.length; index++ ) {
                                // If testProject doesn't exist
                                if ( names.indexOf( testProjects[ index ].projectName ) === -1 ) {
                                    createProjectPromises.push( projectService.createProject( 'multi',
                                        testProjects[ index ].projectName,
                                        testProjects[ index ].projectInfo ) );
                                }
                            }

                            // Waiting for the createProject promise
                            if ( createProjectPromises.length > 0 ) {
                                $q.all( createProjectPromises )
                                    .then( function () {
                                        deferred.resolve();
                                    } );
                            } else {
                                deferred.resolve();
                            }
                        }
                    } );
                //});
            } );

        return deferred.promise;
    };
};