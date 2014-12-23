/*globals WebGMEGlobal*/

'use strict';

module.exports = function ( $q ) {
    var dataStores = {},
        connectQueue = [],
        queueProcessing = false,
        connectNextInQueue,
        processQueue;

    /*isAnotherThreadConnecting = function(databaseId) {
        if (connectingProgress.indexOf(databaseId) !== -1) {
            return true;
        }
        return false;
    };

    connect = function(databaseId, options, deferred) {
        var client;

        connectingProgress.push(databaseId);

        if (dataStores.hasOwnProperty(databaseId)) {
            console.log('connection already exists, remove from connecting phase');
            connectingProgress.splice(connectingProgress.indexOf(databaseId), 1);

            // FIXME: this may or may not ready yet...
            deferred.resolve();
        } else {


            client = new WebGMEGlobal.classes.Client(options);

            // hold a reference to the client instance
            dataStores[databaseId] = {
                client: client
            };

            // TODO: add event listeners to client

            // FIXME: deferred should not be used from closure
            client.connectToDatabaseAsync({}, function(err) {
                console.log('connected, remove from connecting phase');
                connectingProgress.splice(connectingProgress.indexOf(databaseId), 1);
                if (err) {
                    deferred.reject(err);
                    return;
                }

                deferred.resolve();
            });
        }
    };

    waitForAnotherThread = function(databaseId, options, deferred, maxTry) {
        if (isAnotherThreadConnecting(databaseId)) {
            console.log('another thread is connecting: ' + maxTry);
            timer = setTimeout(function() {
                clearTimeout(timer);
                if (maxTry-- > 0) {
                    waitForAnotherThread(databaseId, options, deferred, maxTry);
                }
            }, 100);
        } else {
            console.log('connecting, remaining tries' + maxTry);
            connect(databaseId, options, deferred);
        }
    };*/


    // Picks up the next connectionmeta and tries to connect
    // After a(n) (un)successful connection, the defered resolve/promise is called
    // and the function picks up the next item from the queue
    connectNextInQueue = function () {
        if ( connectQueue.length > 0 ) {
            var currentItem = connectQueue[ 0 ];

            if ( dataStores.hasOwnProperty( currentItem.databaseId ) ) {
                // FIXME: this may or may not ready yet...
                currentItem.deferred.resolve();
                connectQueue.splice( 0, 1 );
                connectNextInQueue();
            } else {
                var client = new WebGMEGlobal.classes.Client( currentItem.options );

                // hold a reference to the client instance
                dataStores[ currentItem.databaseId ] = {
                    client: client
                };

                // TODO: add event listeners to client
                // FIXME: deferred should not be used from closure
                client.connectToDatabaseAsync( {}, function ( err ) {
                    if ( err ) {
                        currentItem.deferred.reject( err );
                    } else {
                        currentItem.deferred.resolve();
                    }

                    connectQueue.splice( 0, 1 );
                    connectNextInQueue();
                } );
            }
        } else {
            queueProcessing = false;
            if ( connectQueue.length > 0 ) {
                processQueue();
            }
        }
    };

    // Check if there are any processing phase
    // No simultaneous processing
    processQueue = function () {
        if ( !queueProcessing ) {
            queueProcessing = true;
            connectNextInQueue();
        }
    };

    // Just one connection phase at one time.
    // Multiple connection phase may cause 'unexpected results'
    this.connectToDatabase = function ( databaseId, options ) {
        var deferred = $q.defer();

        // Put the connection metadata into a queue
        connectQueue.push( {
            databaseId: databaseId, // Where to connect? Default: 'multi'
            deferred: deferred, // defered object, where the notifications are sent if the connection succesful (or not)
            options: options // Connection oprtions
        } );

        processQueue();

        return deferred.promise;
    };

    this.getDatabaseConnection = function ( databaseId ) {
        if ( dataStores.hasOwnProperty( databaseId ) && typeof dataStores[ databaseId ] === 'object' ) {
            return dataStores[ databaseId ];
        }

        console.error( databaseId + ' does not have an active database connection.' );
    };

    this.watchConnection = function ( /*databaseId*/) {
        // TODO: handle events
        // TODO: CONNECTED
        // TODO: DISCONNECTED

        // TODO: NETWORKSTATUS_CHANGED

        throw new Error( 'Not implemented yet.' );
    };

    // TODO: on selected project changed, on initialize and on destroy (socket.io connected/disconnected)
};