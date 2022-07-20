// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Alert} from 'react-native';
import InCallManager from 'react-native-incall-manager';

import {forceLogoutIfNecessary} from '@actions/remote/session';
import {fetchUsersByIds} from '@actions/remote/user';
import {hasMicrophonePermission} from '@calls/actions/permissions';
import {newConnection} from '@calls/connection/connection';
import {
    getCallsConfig,
    getCallsState,
    myselfJoinedCall,
    myselfLeftCall,
    setCalls,
    setChannelEnabled,
    setConfig,
    setPluginEnabled,
    setScreenShareURL,
    setSpeakerPhone,
} from '@calls/state';
import {
    ApiResp,
    Call,
    CallParticipant,
    CallsConnection,
    DefaultCallsConfig,
    ServerChannelState,
} from '@calls/types/calls';
import {getUserIdFromDM} from '@calls/utils';
import {General, Preferences} from '@constants';
import Calls from '@constants/calls';
import DatabaseManager from '@database/manager';
import {getTeammateNameDisplaySetting} from '@helpers/api/preference';
import NetworkManager from '@managers/network_manager';
import {getChannelById} from '@queries/servers/channel';
import {queryPreferencesByCategoryAndName} from '@queries/servers/preference';
import {getCommonSystemValues} from '@queries/servers/system';
import {getCurrentUser, getUserById} from '@queries/servers/user';
import {displayUsername, isSystemAdmin} from '@utils/user';

import type {Client} from '@client/rest';
import type ClientError from '@client/rest/error';
import type {IntlShape} from 'react-intl';

let connection: CallsConnection | null = null;
export const getConnectionForTesting = () => connection;

export const loadConfig = async (serverUrl: string, force = false) => {
    const now = Date.now();
    const config = getCallsConfig(serverUrl);

    if (!force) {
        const lastRetrievedAt = config.last_retrieved_at || 0;
        if ((now - lastRetrievedAt) < Calls.RefreshConfigMillis) {
            return {data: config};
        }
    }

    let client: Client;
    try {
        client = NetworkManager.getClient(serverUrl);
    } catch (error) {
        return {error};
    }

    let data;
    try {
        data = await client.getCallsConfig();
    } catch (error) {
        await forceLogoutIfNecessary(serverUrl, error as ClientError);

        // Reset the config to the default (off) since it looks like Calls is not enabled.
        setConfig(serverUrl, {...DefaultCallsConfig, last_retrieved_at: now});

        return {error};
    }

    const nextConfig = {...config, ...data, last_retrieved_at: now};
    setConfig(serverUrl, nextConfig);
    return {data: nextConfig};
};

export const loadCalls = async (serverUrl: string, userId: string) => {
    let client: Client;
    try {
        client = NetworkManager.getClient(serverUrl);
    } catch (error) {
        return {error};
    }
    let resp: ServerChannelState[] = [];
    try {
        resp = await client.getCalls();
    } catch (error) {
        await forceLogoutIfNecessary(serverUrl, error as ClientError);
        return {error};
    }
    const callsResults: Dictionary<Call> = {};
    const enabledChannels: Dictionary<boolean> = {};

    // Batch load userModels async because we'll need them later
    const ids = new Set<string>();
    resp.forEach((channel) => {
        channel.call?.users.forEach((id) => ids.add(id));
    });
    if (ids.size > 0) {
        fetchUsersByIds(serverUrl, Array.from(ids));
    }

    for (const channel of resp) {
        if (channel.call) {
            const call = channel.call;
            callsResults[channel.channel_id] = {
                participants: channel.call.users.reduce((accum, cur, curIdx) => {
                    const muted = call.states && call.states[curIdx] ? !call.states[curIdx].unmuted : true;
                    const raisedHand = call.states && call.states[curIdx] ? call.states[curIdx].raised_hand : 0;
                    accum[cur] = {id: cur, muted, raisedHand};
                    return accum;
                }, {} as Dictionary<CallParticipant>),
                channelId: channel.channel_id,
                startTime: call.start_at,
                screenOn: call.screen_sharing_id,
                threadId: call.thread_id,
                creatorId: call.creator_id,
            };
        }
        enabledChannels[channel.channel_id] = channel.enabled;
    }

    setCalls(serverUrl, userId, callsResults, enabledChannels);

    return {data: {calls: callsResults, enabled: enabledChannels}};
};

export const loadConfigAndCalls = async (serverUrl: string, userId: string) => {
    const res = await checkIsCallsPluginEnabled(serverUrl);
    if (res.data) {
        loadConfig(serverUrl, true);
        loadCalls(serverUrl, userId);
    }
};

export const checkIsCallsPluginEnabled = async (serverUrl: string) => {
    let client: Client;
    try {
        client = NetworkManager.getClient(serverUrl);
    } catch (error) {
        return {error};
    }

    let data: ClientPluginManifest[] = [];
    try {
        data = await client.getPluginsManifests();
    } catch (error) {
        await forceLogoutIfNecessary(serverUrl, error as ClientError);
        return {error};
    }

    const enabled = data.findIndex((m) => m.id === Calls.PluginId) !== -1;
    setPluginEnabled(serverUrl, enabled);

    return {data: enabled};
};

export const enableChannelCalls = async (serverUrl: string, channelId: string) => {
    let client: Client;
    try {
        client = NetworkManager.getClient(serverUrl);
    } catch (error) {
        return {error};
    }

    try {
        await client.enableChannelCalls(channelId);
    } catch (error) {
        await forceLogoutIfNecessary(serverUrl, error as ClientError);
        return {error};
    }

    setChannelEnabled(serverUrl, channelId, true);
    return {};
};

export const disableChannelCalls = async (serverUrl: string, channelId: string) => {
    let client: Client;
    try {
        client = NetworkManager.getClient(serverUrl);
    } catch (error) {
        return {error};
    }

    try {
        await client.disableChannelCalls(channelId);
    } catch (error) {
        await forceLogoutIfNecessary(serverUrl, error as ClientError);
        return {error};
    }

    setChannelEnabled(serverUrl, channelId, false);
    return {};
};

export const joinCall = async (serverUrl: string, channelId: string, intl: IntlShape) => {
    // Edge case: calls was disabled when app loaded, and then enabled, but app hasn't
    // reconnected its websocket since then (i.e., hasn't called batchLoadCalls yet)
    const {data: enabled} = await checkIsCallsPluginEnabled(serverUrl);
    if (!enabled) {
        return {error: 'calls plugin not enabled'};
    }

    const hasPermission = await hasMicrophonePermission(intl);
    if (!hasPermission) {
        return {error: 'no permissions to microphone, unable to start call'};
    }

    if (connection) {
        connection.disconnect();
        connection = null;
    }
    setSpeakerphoneOn(false);

    try {
        connection = await newConnection(serverUrl, channelId, () => null, setScreenShareURL);
    } catch (error) {
        await forceLogoutIfNecessary(serverUrl, error as ClientError);
        return {error};
    }

    try {
        await connection.waitForReady();
        myselfJoinedCall(serverUrl, channelId);
        return {data: channelId};
    } catch (e) {
        connection.disconnect();
        connection = null;
        return {error: 'unable to connect to the voice call'};
    }
};

export const leaveCall = () => {
    if (connection) {
        connection.disconnect();
        connection = null;
    }
    setSpeakerphoneOn(false);
    myselfLeftCall();
};

export const muteMyself = () => {
    if (connection) {
        connection.mute();
    }
};

export const unmuteMyself = () => {
    if (connection) {
        connection.unmute();
    }
};

export const raiseHand = () => {
    if (connection) {
        connection.raiseHand();
    }
};

export const unraiseHand = () => {
    if (connection) {
        connection.unraiseHand();
    }
};

export const setSpeakerphoneOn = (speakerphoneOn: boolean) => {
    InCallManager.setSpeakerphoneOn(speakerphoneOn);
    setSpeakerPhone(speakerphoneOn);
};

export const endCallAlert = async (serverUrl: string, intl: IntlShape, channelId: string) => {
    const database = DatabaseManager.serverDatabases[serverUrl]?.database;
    if (!database) {
        return;
    }

    const currentUser = await getCurrentUser(database);
    if (!currentUser) {
        return;
    }

    const channel = await getChannelById(database, channelId);
    if (!channel) {
        return;
    }

    const call = getCallsState(serverUrl).calls[channelId];
    if (!call) {
        return;
    }

    const numParticipants = Object.keys(call.participants).length || 0;
    const isAdmin = isSystemAdmin(currentUser.roles);
    const {formatMessage} = intl;

    if (!isAdmin && currentUser.id !== call.creatorId) {
        Alert.alert(
            formatMessage({
                id: 'mobile.calls_end_permission_title',
                defaultMessage: 'Error',
            }),
            formatMessage({
                id: 'mobile.calls_end_permission_msg',
                defaultMessage: 'You do not have permission to end the call. Please ask the call creator to end the call.',
            }));
        return;
    }

    const endCall = async () => {
        const client = NetworkManager.getClient(serverUrl);

        let data: ApiResp;
        try {
            data = await client.endCall(channelId);
        } catch (error) {
            await forceLogoutIfNecessary(serverUrl, error as ClientError);
            throw error;
        }

        return data;
    };

    const title = formatMessage({id: 'mobile.calls_end_call_title', defaultMessage: 'End call'});
    let msg = formatMessage({
        id: 'mobile.calls_end_msg_channel',
        defaultMessage: 'Are you sure you want to end a call with {numParticipants} participants in {displayName}?',
    }, {numParticipants, displayName: channel.displayName});

    if (channel.type === General.DM_CHANNEL) {
        const otherID = getUserIdFromDM(channel.name, currentUser.id);
        const otherUser = await getUserById(database, otherID);
        const {config, license} = await getCommonSystemValues(database);
        const preferences = await queryPreferencesByCategoryAndName(database, Preferences.CATEGORY_DISPLAY_SETTINGS, Preferences.NAME_NAME_FORMAT).fetch();
        const displaySetting = getTeammateNameDisplaySetting(preferences, config, license);
        msg = formatMessage({
            id: 'mobile.calls_end_msg_dm',
            defaultMessage: 'Are you sure you want to end a call with {displayName}?',
        }, {displayName: displayUsername(otherUser, intl.locale, displaySetting)});
    }
    const cancel = formatMessage({id: 'mobile.post.cancel', defaultMessage: 'Cancel'});

    Alert.alert(
        title,
        msg,
        [
            {
                text: cancel,
            },
            {
                text: title,
                onPress: async () => {
                    try {
                        await endCall();
                    } catch (e) {
                        const err = (e as ClientError).message || 'unable to complete command, see server logs';
                        Alert.alert('Error', `Error: ${err}`);
                    }
                },
                style: 'cancel',
            },
        ],
    );
};