import {DEFAULT_SETTINGS, DEFAULT_THEME} from '../defaults';
import {debounce} from '../utils/debounce';
import {isURLMatched} from '../utils/url';
import type {UserSettings} from '../definitions';
import {readSyncStorage, readLocalStorage, writeSyncStorage, writeLocalStorage} from './utils/extension-api';
import {logWarn} from '../utils/log';
import {PromiseBarrier} from '../utils/promise-barrier';
import {validateSettings} from '../utils/validation';
import {isValidHexColor} from '../utils/colorscheme-parser';

const SAVE_TIMEOUT = 1000;

export default class UserStorage {
    private loadBarrier: PromiseBarrier<UserSettings, void>;
    private saveStorageBarrier: PromiseBarrier<void, void>;

    constructor() {
        this.settings = null;
    }

    settings: Readonly<UserSettings>;

    async loadSettings() {
        this.settings = await this.loadSettingsFromStorage();
    }

    private fillDefaults(settings: UserSettings) {
        settings.theme = {...DEFAULT_THEME, ...settings.theme};
        this.cssUpdate(settings);
        settings.time = {...DEFAULT_SETTINGS.time, ...settings.time};
        settings.presets.forEach((preset) => {
            preset.theme = {...DEFAULT_THEME, ...preset.theme};
            this.cssUpdate(preset);
        });
        settings.customThemes.forEach((site) => {
            site.theme = {...DEFAULT_THEME, ...site.theme};
            this.cssUpdate(site);
        });
    }

    private async loadSettingsFromStorage(): Promise<UserSettings> {
        if (this.loadBarrier) {
            return await this.loadBarrier.entry();
        }
        this.loadBarrier = new PromiseBarrier();

        const local = await readLocalStorage(DEFAULT_SETTINGS);
        const {errors: localCfgErrors} = validateSettings(local);
        localCfgErrors.forEach((err) => logWarn(err));
        if (local.syncSettings == null) {
            local.syncSettings = DEFAULT_SETTINGS.syncSettings;
        }
        if (!local.syncSettings) {
            this.fillDefaults(local);
            this.loadBarrier.resolve(local);
            return local;
        }

        const $sync = await readSyncStorage(DEFAULT_SETTINGS);
        if (!$sync) {
            logWarn('Sync settings are missing');
            local.syncSettings = false;
            this.set({syncSettings: false});
            this.saveSyncSetting(false);
            this.loadBarrier.resolve(local);
            return local;
        }

        const {errors: syncCfgErrors} = validateSettings($sync);
        syncCfgErrors.forEach((err) => logWarn(err));

        this.fillDefaults($sync);

        this.loadBarrier.resolve($sync);
        return $sync;
    }

    async saveSettings() {
        await this.saveSettingsIntoStorage();
    }

    async saveSyncSetting(sync: boolean) {
        const obj = {syncSettings: sync};
        await writeLocalStorage(obj);
        try {
            await writeSyncStorage(obj);
        } catch (err) {
            logWarn('Settings synchronization was disabled due to error:', chrome.runtime.lastError);
            this.set({syncSettings: false});
        }
    }

    private saveSettingsIntoStorage = debounce(SAVE_TIMEOUT, async () => {
        if (this.saveStorageBarrier) {
            await this.saveStorageBarrier.entry();
            return;
        }
        this.saveStorageBarrier = new PromiseBarrier();

        const settings = this.settings;
        if (settings.syncSettings) {
            try {
                await writeSyncStorage(settings);
            } catch (err) {
                logWarn('Settings synchronization was disabled due to error:', chrome.runtime.lastError);
                this.set({syncSettings: false});
                await this.saveSyncSetting(false);
                await writeLocalStorage(settings);
            }
        } else {
            await writeLocalStorage(settings);
        }

        this.saveStorageBarrier.resolve();
        this.saveStorageBarrier = null;
    });
    private rootVariables = getComputedStyle(document.documentElement);

    private cssUpdate(settings: Partial<UserSettings>) {
        if (settings.theme.darkSchemeCssVariableBg && isValidHexColor(this.rootVariables.getPropertyValue(settings.theme.darkSchemeCssVariableBg).trim())){
            settings.theme.darkSchemeBackgroundColor = this.rootVariables.getPropertyValue(settings.theme.darkSchemeCssVariableBg).trim();
        }
        if (settings.theme.darkSchemeCssVariableText && isValidHexColor(this.rootVariables.getPropertyValue(settings.theme.darkSchemeCssVariableText).trim())){
            settings.theme.darkSchemeTextColor = this.rootVariables.getPropertyValue(settings.theme.darkSchemeCssVariableText).trim();
        }
        if (settings.theme.lightSchemeCssVariableBg && isValidHexColor(this.rootVariables.getPropertyValue(settings.theme.lightSchemeCssVariableBg).trim())){
            settings.theme.lightSchemeBackgroundColor = this.rootVariables.getPropertyValue(settings.theme.lightSchemeCssVariableBg).trim();
        }
        if (settings.theme.lightSchemeCssVariableText && isValidHexColor(this.rootVariables.getPropertyValue(settings.theme.lightSchemeCssVariableText).trim())){
            settings.theme.lightSchemeTextColor = this.rootVariables.getPropertyValue(settings.theme.lightSchemeCssVariableText).trim();
        }
        if (settings.theme.cssVariableScrollBar && isValidHexColor(this.rootVariables.getPropertyValue(settings.theme.cssVariableScrollBar).trim())){
            settings.theme.scrollbarColor = this.rootVariables.getPropertyValue(settings.theme.cssVariableScrollBar).trim();
        }
        if (settings.theme.cssVariableSelection && isValidHexColor(this.rootVariables.getPropertyValue(settings.theme.cssVariableSelection).trim())){
            settings.theme.selectionColor = this.rootVariables.getPropertyValue(settings.theme.cssVariableSelection).trim();
        }
    }

    set($settings: Partial<UserSettings>) {
        if ($settings.siteList) {
            if (!Array.isArray($settings.siteList)) {
                const list: string[] = [];
                for (const key in ($settings.siteList as string[])) {
                    const index = Number(key);
                    if (!isNaN(index)) {
                        list[index] = $settings.siteList[key];
                    }
                }
                $settings.siteList = list;
            }
            const siteList = $settings.siteList.filter((pattern) => {
                let isOK = false;
                try {
                    isURLMatched('https://google.com/', pattern);
                    isURLMatched('[::1]:1337', pattern);
                    isOK = true;
                } catch (err) {
                    logWarn(`Pattern "${pattern}" excluded`);
                }
                return isOK && pattern !== '/';
            });
            $settings = {...$settings, siteList};
        }
        this.settings = {...this.settings, ...$settings};
    }
}
