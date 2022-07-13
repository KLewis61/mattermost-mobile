// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {StyleSheet} from 'react-native';
import {Edge, SafeAreaView} from 'react-native-safe-area-context';

import {savePreference} from '@actions/remote/preference';
import {Preferences} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {t} from '@i18n';
import {popTopScreen, setButtons} from '@screens/navigation';
import SettingSeparator from '@screens/settings/settings_separator';

import {getSaveButton} from '../config';
import SettingBlock from '../setting_block';
import SettingOption from '../setting_option';

const footer = {
    id: t('settings_display.clock.preferTime'),
    defaultMessage: 'Select how you prefer time displayed.',
};

const edges: Edge[] = ['left', 'right'];
const CLOCK_TYPE = {
    NORMAL: 'NORMAL',
    MILITARY: 'MILITARY',
} as const;

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});

const SAVE_CLOCK_BUTTON_ID = 'settings_display.clock.save.button';

type DisplayClockProps = {
    componentId: string;
    currentUserId: string;
    hasMilitaryTimeFormat: boolean;
}
const DisplayClock = ({componentId, currentUserId, hasMilitaryTimeFormat}: DisplayClockProps) => {
    const theme = useTheme();
    const [isMilitaryTimeFormat, setIsMilitaryTimeFormat] = useState(hasMilitaryTimeFormat);
    const serverUrl = useServerUrl();
    const intl = useIntl();

    const saveButton = useMemo(() => getSaveButton(SAVE_CLOCK_BUTTON_ID, intl, theme), [theme.sidebarHeaderTextColor]);

    const onSelectClockPreference = useCallback((clockType: keyof typeof CLOCK_TYPE) => {
        setIsMilitaryTimeFormat(clockType === CLOCK_TYPE.MILITARY);
    }, []);

    const close = () => popTopScreen(componentId);

    const saveClockDisplayPreference = () => {
        const timePreference: PreferenceType = {
            category: Preferences.CATEGORY_DISPLAY_SETTINGS,
            name: 'use_military_time',
            user_id: currentUserId,
            value: `${isMilitaryTimeFormat}`,
        };

        savePreference(serverUrl, [timePreference]);
        close();
    };

    useEffect(() => {
        const buttons = {
            rightButtons: [{
                ...saveButton,
                enabled: hasMilitaryTimeFormat !== isMilitaryTimeFormat,
            }],
        };
        setButtons(componentId, buttons);
    }, [componentId, saveButton, isMilitaryTimeFormat]);

    useAndroidHardwareBackHandler(componentId, close);
    useNavButtonPressed(SAVE_CLOCK_BUTTON_ID, componentId, saveClockDisplayPreference, [isMilitaryTimeFormat]);

    return (
        <SafeAreaView
            edges={edges}
            style={styles.container}
            testID='settings_display.screen'
        >
            <SettingBlock
                disableHeader={true}
                footerText={footer}
            >
                <SettingOption
                    action={onSelectClockPreference}
                    label={intl.formatMessage({id: 'settings_display.clock.normal', defaultMessage: '12-hour clock (example: 4:00 PM)'})}
                    selected={!isMilitaryTimeFormat}
                    testID='clock_display_settings.normal_clock.action'
                    type='select'
                    value={CLOCK_TYPE.NORMAL}
                />
                <SettingSeparator/>
                <SettingOption
                    action={onSelectClockPreference}
                    label={intl.formatMessage({id: 'settings_display.clock.military', defaultMessage: '24-hour clock (example: 16:00)'})}
                    selected={isMilitaryTimeFormat}
                    testID='clock_display_settings.military_clock.action'
                    type='select'
                    value={CLOCK_TYPE.MILITARY}
                />
            </SettingBlock>
        </SafeAreaView>
    );
};

export default DisplayClock;
