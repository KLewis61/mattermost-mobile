// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {View} from 'react-native';
import Button from 'react-native-button';
import {FlatList} from 'react-native-gesture-handler';

import CompassIcon from '@app/components/compass_icon';
import FormattedText from '@components/formatted_text';
import MenuItem from '@components/menu_item';
import {useTheme} from '@context/theme';
import {useIsTablet} from '@hooks/device';
import BottomSheetContent from '@screens/bottom_sheet/content';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    return {
        labelContainer: {
            aligntItems: 'center',
            flexDirection: 'row',
            justifyContent: 'space-between',
        },
        contentContainer: {
            marginVertical: 4,
            marginHorizontal: 20,
        },
        menuText: {
            ...typography('Body', 200, 'Regular'),
        },
        icon: {
            marginRight: 12,
        },
        selected: {
            color: theme.buttonBg,
        },
        unselected: {
            color: changeOpacity(theme.centerChannelColor, 0.32),
        },
    };
});

type FilterItem = {
    id: string;
    defaultMessage: string;
}

export type FilterState = {
    Documents: boolean;
    Spreadsheets: boolean;
    Presentations: boolean;
    Code: boolean;
    Images: boolean;
    Audio: boolean;
    Videos: boolean;
}

type FilterProps = {
    initialState: FilterState;
    setParentFilterState: (state: FilterState) => void;
}

export const clearedState: FilterState = {
    Documents: false,
    Spreadsheets: false,
    Presentations: false,
    Code: false,
    Images: false,
    Audio: false,
    Videos: false,
};

const Filter = ({initialState, setParentFilterState}: FilterProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const style = getStyleSheet(theme);
    const isTablet = useIsTablet();

    const [enableShowResults, setEnableShowResults] = useState(false);
    const [filterState, setFilterState] = useState(initialState);

    const handleMyState = useCallback((value: keyof FilterState) => {
        const oldValue = filterState[value];
        const newState = {
            ...filterState,
        };
        newState[value] = !oldValue;
        setFilterState(newState);
    }, [filterState, setFilterState]);

    const data = useMemo(() => {
        return [
            {
                id: 'screen.search.results.filter.documents',
                defaultMessage: 'Documents',
            }, {
                id: 'screen.search.results.filter.spreadsheets',
                defaultMessage: 'Spreadsheets',
            }, {
                id: 'screen.search.results.filter.presentations',
                defaultMessage: 'Presentations',
            }, {
                id: 'screen.search.results.filter.code',
                defaultMessage: 'Code',
            }, {
                id: 'screen.search.results.filter.images',
                defaultMessage: 'Images',
            }, {
                id: 'screen.search.results.filter.audio',
                defaultMessage: 'Audio',
            }, {
                id: 'screen.search.results.filter.videos',
                defaultMessage: 'Videos',
            },
        ];
    }, [filterState, setFilterState, handleMyState]);

    const renderLabelComponent = useCallback((item: FilterItem) => {
        return (
            <View style={style.labelContainer}>
                <FormattedText
                    style={style.menuText}
                    id={item.id}
                    defaultMessage={item.defaultMessage}
                />
                <View style={style.icon}>
                    <CompassIcon
                        style={filterState[item.defaultMessage as keyof FilterState] ? style.selected : style.unselected}
                        name={filterState[item.defaultMessage as keyof FilterState] ? 'check-circle' : 'circle-outline'}
                        size={31.2}
                        color={'blue'}
                    />
                </View>
            </View>
        );
    }, [data, filterState]);

    const renderFilterItem = useCallback(({item}) => {
        return (
            <MenuItem
                labelComponent={renderLabelComponent(item)}
                onPress={() => {
                    handleMyState(item.defaultMessage);
                }}
                testID={item.id}
                theme={theme}
            />
        );
    }, [filterState, setFilterState]);

    const handleClearAll = useCallback(() => {
        setFilterState(clearedState);
    }, []);

    const renderTitleComponent = useCallback(() => {
        return (
            <Button
                onPress={handleClearAll}
            >
                <FormattedText
                    style={style.menuText}
                    id={'screen.search.results.filter.clear_all'}
                    defaultMessage={'Clear all'}
                />
            </Button>
        );
    }, []);

    useEffect(() => {
        setEnableShowResults(JSON.stringify(filterState) === JSON.stringify(initialState));
    }, [filterState, initialState]);

    useEffect(() => {
        return function cleanup() {
            setParentFilterState(filterState);
        };
    }, [filterState]);

    const buttonText = intl.formatMessage({id: 'screen.search.results.filter.show_results', defaultMessage: 'Show results'});
    const buttonTitle = intl.formatMessage({id: 'screen.search.results.filter.title', defaultMessage: 'Filter by file type'});

    return (
        <BottomSheetContent
            disableButton={enableShowResults}
            buttonText={buttonText}
            showButton={true}
            rightTitleComponent={renderTitleComponent()}
            showTitle={!isTablet}
            testID='search.filters'
            title={buttonTitle}
        >
            <View style={style.container}>
                <FlatList
                    data={data}
                    renderItem={renderFilterItem}
                    contentContainerStyle={style.contentContainer}
                />
            </View>
        </BottomSheetContent>
    );
};

export default Filter;
