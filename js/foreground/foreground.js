﻿//  When the foreground is loaded it will load all the ui elements. Grouped like this so I can wait for the
//  background YouTube player to load entirely before allowing foreground to open.
define([
    'settings',
    'loadingSpinnerView',
    'reloadPromptView',
    'activeFolderAreaView',
    'activePlaylistAreaView',
    'activePlaylistArea',
    'videoSearchView',
    'videoSearch',
    'addSearchResults',
    'addSearchResultsView',
    'videoSearchResults',
    'contextMenuView',
    'contextMenuGroups',
    'rightPaneView'
], function (Settings, LoadingSpinnerView, ReloadPromptView, ActiveFolderAreaView, ActivePlaylistAreaView, ActivePlaylistArea, VideoSearchView, VideoSearch, AddSearchResults, AddSearchResultsView, VideoSearchResults, ContextMenuView, ContextMenuGroups, RightPaneView) {
    'use strict';

    var ForegroundView = Backbone.View.extend({

        el: $('body'),
        
        activeFolderAreaView: null,
        activePlaylistAreaView: null,
        videoSearchView: null,
        addSearchResults: null,
        rightPaneView: null,
        contextMenuView: new ContextMenuView,
        loadingSpinnerView: new LoadingSpinnerView,
        reloadPromptView: new ReloadPromptView,
        showReloadPromptTimeout: null,
               
        //  These are pulled from the background page. They'll be null until background is fully initialized.
        backgroundPlayer: chrome.extension.getBackgroundPage().YouTubePlayer,
        backgroundUser: chrome.extension.getBackgroundPage().User,

        events: {
            
            'click #addVideosButton': 'showVideoSearch',
            'click #button-back': 'hideVideoSearch',
            'click #toggleActiveFolderAreaButton': 'toggleActiveFolderArea',
            'click #activeFolderArea': 'doActiveFolderAreaButtonClick',
            'click .toggleButton': 'toggleButton'
        },

        initialize: function () {
            
            var self = this;
            
            this.$el.append(this.loadingSpinnerView.render().el);
            this.$el.append(this.contextMenuView.render().el);

            //If the foreground hasn't properly initialized after 5 seconds offer the ability to restart the program.
            //Background.js might have gone awry for some reason and it is not always clear how to restart Streamus via chrome://extension
            this.showReloadPromptTimeout = setTimeout(function () {
                
                var reloadPromptElement = self.reloadPromptView.render().el;
                self.$el.append(reloadPromptElement);
                
                $(reloadPromptElement).find('.panel').fadeIn(200, function () {
                    $(reloadPromptElement).addClass('visible');
                });
                
            }, 3000);

            //  If the user opens the foreground SUPER FAST then requireJS won't have been able to load everything in the background in time.
            if (this.backgroundPlayer == null || this.backgroundUser == null) {

                //  TODO: Maybe just wait for a background isReady event and let the background handle this instead of polling?
                //  Poll the background until it is ready.
                var checkBackgroundLoadedInterval = setInterval(function () {

                    self.backgroundPlayer = chrome.extension.getBackgroundPage().YouTubePlayer;
                    self.backgroundUser = chrome.extension.getBackgroundPage().User;

                    if (self.backgroundPlayer != null && self.backgroundUser != null) {

                        clearInterval(checkBackgroundLoadedInterval);
                        self.waitForBackgroundUserLoaded();
                    }

                }, 100);

            } else {
                this.waitForBackgroundUserLoaded();
            }

            //  If a click occurs and the default isn't prevented, reset the context menu groups to hide it.
            //  Child elements will call event.preventDefault() to indicate that they have handled the context menu.
            this.$el.on('click contextmenu', function (event) {

                var isDefaultPrevented = event.isDefaultPrevented();
                
                if (isDefaultPrevented) {

                    self.contextMenuView.show({
                        top: event.pageY,
                        left: event.pageX + 1
                    });
                    
                } else {
                    ContextMenuGroups.reset();
                }

            });

        },
        
        waitForBackgroundUserLoaded: function () {

            this.listenTo(this.backgroundUser, 'change:loaded', function (model, loaded) {

                console.log("BackgroundUser change:loaded has fired:", model, loaded);

                if (loaded) {
                    this.waitForBackgroundPlayerReady();
                } else {
                    //  TODO: Display a loading message while user data is refreshing.
                    console.log("user is unloaded, waiting!");
                }

            });

            //  If the foreground is opened before the background has had a chance to load, wait for the background.
            //  This is easier than having every control on the foreground guard against the background not existing.
            if (this.backgroundUser.get('loaded')) {
                this.waitForBackgroundPlayerReady();
            }

        },
        
        waitForBackgroundPlayerReady: function () {

            this.listenTo(this.backgroundPlayer, 'change:ready', function (model, ready) {

                if (ready) {
                    this.loadBackgroundDependentContent();
                } else {
                    console.log("BackgroundPlayer has gone unready, need to show message.");
                }

            });

            if (this.backgroundPlayer.get('ready')) {
                //  Load foreground when the background indicates it has loaded.
                this.loadBackgroundDependentContent();
            }
        },
        
        loadBackgroundDependentContent: function () {
            this.$el.removeClass('loading');
            clearTimeout(this.showReloadPromptTimeout);
            this.reloadPromptView.remove();
            this.loadingSpinnerView.remove();

            var activeFolder = this.backgroundUser.get('folders').getActiveFolder();

            this.rightPaneView = new RightPaneView({
                activeFolder: activeFolder
            });
            this.$el.append(this.rightPaneView.render().el);

            //  TODO: Instead of calling changeModel I should be removing/recreating my views I think.
            var activePlaylistArea = new ActivePlaylistArea({
                playlist: activeFolder.getActivePlaylist()
            });

            if (this.activePlaylistAreaView === null) {

                this.activePlaylistAreaView = new ActivePlaylistAreaView({
                    model: activePlaylistArea
                });

                this.$el.append(this.activePlaylistAreaView.render().el);

            } else {
                this.activePlaylistAreaView.changeModel(activePlaylistArea);
            }

            //  TODO: Refactor ALL of this. Just using it as a transitioning spot to get the new UI into views.



            return;

            //  VideoDisplayView properly uses a template so I can just remove and re-create it I believe.
            if (this.videoDisplayView) {
                this.videoDisplayView.remove();
            }
            this.videoDisplayView = new VideoDisplayView;

            var folders = this.backgroundUser.get('folders');

            this.listenTo(folders, 'change:active', function (folder, isActive) {

                //  TODO: Instead of calling changeModel, I would like to remove the view and re-add it.
                if (isActive) {
                    this.activeFolderAreaView.changeModel(folder);
                    this.streamView.changeModel(activeFolder);
                }

            });

            //  TODO: if activeFolder changes I think I'll need to unbind and rebind
            var playlists = folders.getActiveFolder().get('playlists');
            this.listenTo(playlists, 'change:active', function (playlist, isActive) {

                //  TODO: Instead of calling changeModel, I would like to remove the view and re-add it.
                if (isActive) {
                    
                    var activePlaylistArea = new ActivePlaylistArea({
                        playlist: activeFolder.getActivePlaylist()
                    });

                    this.activePlaylistAreaView.changeModel(playlist);
                }

            });
        },
        
        toggleButton: function (event) {
            $(event.currentTarget).toggleClass('enabled');
        },
        
        doActiveFolderAreaButtonClick: function () {
            $('#toggleActiveFolderAreaButton').click();
        },
        
        toggleActiveFolderArea: function () {

            var self = this;

            if (this.activeFolderAreaView === null) {
                
                var activeFolder = this.backgroundUser.get('folders').getActiveFolder();

                this.activeFolderAreaView = new ActiveFolderAreaView({
                    model: activeFolder
                });

                this.$el.append(this.activeFolderAreaView.render().el);
                this.activeFolderAreaView.show();

            } else {

                this.activeFolderAreaView.hide(function() {
                    self.activeFolderAreaView = null;
                });
                
            }

        },
        
        showVideoSearch: function () {

            var activeFolder = this.backgroundUser.get('folders').getActiveFolder();

            var videoSearch = new VideoSearch({
                relatedPlaylist: activeFolder.getActivePlaylist()
            });
            
            this.videoSearchView = new VideoSearchView({
                model: videoSearch
            });
            
            this.$el.append(this.videoSearchView.render().el);
            this.videoSearchView.showAndFocus();

            this.listenTo(VideoSearchResults, 'change:selected', function (changedItem, selected) {

                console.log("this.addSearchResults:", this.addSearchResults);
                console.log("Selected:", selected);

                if (selected && this.addSearchResults === null) {
                    this.showAddSearchResults();
                }
                else if (!selected) {
                    
                    var noSearchResultsSelected = VideoSearchResults.selected().length === 0;

                    if (noSearchResultsSelected) {
                        this.addSearchResults.destroy();
                    }

                }

            });

            $("#toggleActiveFolderAreaButton, #playlists").fadeOut();
            $("#button-back").fadeIn();
            
        },
        
        hideVideoSearch: function () {
            var self = this;
            
            this.videoSearchView.hide(function() {
                self.videoSearchView = null;
            });
            
            if (this.addSearchResults) {
                this.addSearchResults.destroy();
            }
            
            $("#button-back").fadeOut();
            $("#toggleActiveFolderAreaButton, #playlists").fadeIn();

            this.activePlaylistAreaView.activePlaylistItemsView.$el.trigger('manualShow');
        },
        
        showAddSearchResults: function () {

            var activeFolder = this.backgroundUser.get('folders').getActiveFolder();

            this.addSearchResults = new AddSearchResults({
                relatedFolder: activeFolder
            });

            this.listenTo(this.addSearchResults, 'destroy', function () {
                this.stopListening(this.addSearchResults);
                this.addSearchResults = null;
            });

            var addSearchResultsView = new AddSearchResultsView({
                model: this.addSearchResults
            });

            this.$el.append(addSearchResultsView.render().el);
            addSearchResultsView.show();
            
        }
    });

    return new ForegroundView;
});