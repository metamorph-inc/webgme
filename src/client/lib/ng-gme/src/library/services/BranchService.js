'use strict';

module.exports = function ( $q, dataStoreService, projectService ) {

    this.selectBranch = function ( databaseId, branchId ) {
        var dbConn = dataStoreService.getDatabaseConnection( databaseId ),
            deferred = new $q.defer();

        dbConn.branchService = dbConn.branchService || {};

        dbConn.client.selectBranchAsync( branchId,
            function ( err ) {
                if ( err ) {
                    deferred.reject( err );
                    return;
                }

                dbConn.branchService.branchId = branchId;

                deferred.resolve( branchId );
            } );

        return deferred.promise;
    };

    this.getSelectedBranch = function ( /*databaseId*/) {
        throw new Error( 'Not implemented yet.' );
    };

    this.watchBranches = function ( /*databaseId*/) {
        // TODO: register for branch events
        // TODO: SERVER_BRANCH_CREATED
        // TODO: SERVER_BRANCH_UPDATED
        // TODO: SERVER_BRANCH_DELETED

        throw new Error( 'Not implemented yet.' );
    };

    this.watchBranchState = function ( /*databaseId*/) {
        // TODO: register for branch state events
        // TODO: SYNC
        // TODO: FORKED
        // TODO: OFFLINE

        // TODO: BRANCHSTATUS_CHANGED

        throw new Error( 'Not implemented yet.' );
    };

    this.on = function ( databaseId, eventName, fn ) {
        var dbConn,
            i;

        console.assert( typeof databaseId === 'string' );
        console.assert( typeof eventName === 'string' );
        console.assert( typeof fn === 'function' );

        dbConn = dataStoreService.getDatabaseConnection( databaseId );
        dbConn.branchService = dbConn.branchService || {};

        dbConn.branchService.isInitialized = dbConn.branchService.isInitialized || false;

        if ( typeof dbConn.branchService.events === 'undefined' ) {
            // register for project events
            projectService.on( databaseId, 'initialize', function ( dbId ) {
                var dbConnEvent = dataStoreService.getDatabaseConnection( dbId ),
                    i;

                if ( dbConnEvent.branchService &&
                    dbConnEvent.branchService.events &&
                    dbConnEvent.branchService.events.initialize ) {

                    dbConnEvent.branchService.isInitialized = true;

                    for ( i = 0; i < dbConnEvent.branchService.events.initialize.length; i += 1 ) {
                        dbConnEvent.branchService.events.initialize[ i ]( dbId );
                    }
                }
            } );

            projectService.on( databaseId, 'destroy', function ( dbId ) {
                var dbConnEvent = dataStoreService.getDatabaseConnection( dbId ),
                    i;

                if ( dbConnEvent.branchService &&
                    dbConnEvent.branchService.events &&
                    dbConnEvent.branchService.events.destroy ) {

                    dbConnEvent.branchService.isInitialized = false;

                    for ( i = 0; i < dbConnEvent.nodeService.events.destroy.length; i += 1 ) {
                        dbConnEvent.branchService.events.destroy[ i ]( dbId );
                    }
                }
            } );

            dbConn.client.addEventListener( dbConn.client.events.BRANCH_CHANGED,
                function ( projectId /* FIXME */ , branchId ) {

                    if ( dbConn.branchService.branchId !== branchId ) {

                        dbConn.branchService.branchId = branchId;

                        console.log( 'There was a BRANCH_CHANGED event', branchId );
                        if ( branchId ) {
                            // initialize
                            if ( dbConn.branchService &&
                                dbConn.branchService.events &&
                                dbConn.branchService.events.initialize ) {

                                dbConn.branchService.isInitialized = true;

                                for ( i = 0; i < dbConn.branchService.events.initialize.length; i += 1 ) {
                                    dbConn.branchService.events.initialize[ i ]( databaseId );
                                }
                            }
                        } else {
                            // branchId is falsy, empty or null or undefined
                            // destroy
                            if ( dbConn.branchService &&
                                dbConn.branchService.events &&
                                dbConn.branchService.events.destroy ) {

                                dbConn.branchService.isInitialized = false;
                                delete dbConn.branchService.branchId;

                                for ( i = 0; i < dbConn.branchService.events.destroy.length; i += 1 ) {
                                    dbConn.branchService.events.destroy[ i ]( databaseId );
                                }
                            }
                        }
                    }
                } );
        }

        dbConn.branchService.events = dbConn.branchService.events || {};
        dbConn.branchService.events[ eventName ] = dbConn.branchService.events[ eventName ] || [];
        dbConn.branchService.events[ eventName ].push( fn );

        if ( dbConn.branchService.isInitialized ) {
            if ( eventName === 'initialize' ) {
                fn( databaseId );
            }
        } else {
            if ( eventName === 'destroy' ) {
                fn( databaseId );
            }
        }

        // TODO: register for branch change event OR BranchService onInitialize
    };
};