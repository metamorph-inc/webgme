/*globals angular*/
'use strict';

angular.module(
    'gme.directives.termFilter', [
        'isis.ui.taxonomyTerm'
    ]

)
    .filter( 'isSelected', [

        function () {
            return function ( input, selectedTermIds, direction ) {
                var output = [];

                angular.forEach( input, function ( term ) {

                    if ( direction === -1 ) {

                        if ( selectedTermIds.indexOf( term.id ) === -1 ) {
                            output.push( term );
                        }

                    } else {

                        if ( selectedTermIds.indexOf( term.id ) > -1 ) {
                            output.push( term );
                        }

                    }
                } );

                return output;

            };
        }
    ] )
    .filter( 'termFilter', function () {
        return function ( input, selectedTermIds ) {

            var output = [],
                countOfTermHits;

            if ( angular.isArray( selectedTermIds ) && selectedTermIds.length ) {

                angular.forEach( input, function ( elem ) {

                    countOfTermHits = 0;

                    angular.forEach( elem.taxonomyTerms, function ( aTerm ) {

                        countOfTermHits = countOfTermHits && countOfTermHits;

                        if ( selectedTermIds.indexOf( aTerm.id ) > -1 ) {
                            countOfTermHits += 1;
                        }

                    } );

                    if ( countOfTermHits === selectedTermIds.length ) {
                        output.push( elem );
                    }

                } );

            } else {
                output = input;
            }

            return output;

        };
    } )
    .controller( 'TermFilterController', function ( $scope ) {

        $scope.toggle = function ( term ) {

            var index;

            index = $scope.selectedTermIds.indexOf( term.id );

            if ( index === -1 ) {
                $scope.selectedTermIds.push( term.id );
            } else {
                $scope.selectedTermIds.splice( index, 1 );
            }
        };

    } )
    .directive(
        'termFilter',
        function () {

            return {
                scope: {
                    availableTerms: '=',
                    selectedTermIds: '='
                },
                controller: 'TermFilterController',
                restrict: 'E',
                replace: true,
                templateUrl: '/ng-gme/templates/termFilter.html'
            };
        } );