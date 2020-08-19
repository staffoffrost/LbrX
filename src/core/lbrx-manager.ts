import { DevtoolsOptions } from '../dev-tools'
import { enableProdMode } from '../internal/core/lbrx-mode'
import { DevToolsManager } from '../internal/dev-tools'
import { logError } from '../internal/helpers'
import { GlobalStoreConfigOptions, setGlobalStoreConfig } from '../internal/stores/config'
import { ZoneLike } from '../internal/types'

/**
 * LbrX static class.
 * @static
 */
export class LbrXManager {

  private static _devToolsManager: DevToolsManager | null = null

  /**
   * Enabling production mode will improve performance and
   * will log errors instead of throwing them.
   */
  static enableProdMode(): typeof LbrXManager {
    enableProdMode()
    return LbrXManager
  }

  /**
   * Initializes Redux DevTools.
   */
  static initializeDevTools(devToolsOptions?: Partial<DevtoolsOptions>): typeof LbrXManager {
    LbrXManager._devToolsManager = new DevToolsManager(devToolsOptions)
    LbrXManager._devToolsManager.initialize()
    return LbrXManager
  }

  /**
   * Sets global store configuration for all stores.
   */
  static setGlobalStoreConfig(options: GlobalStoreConfigOptions): typeof LbrXManager {
    setGlobalStoreConfig(options)
    return LbrXManager
  }

  /**
   * Set a zone function that will run callbacks from Redux DevTools events.
   * @example
   * `Angular:`
   * class AppComponent implements OnInit {
   * 	constructor(private _zone: NgZone) { }
   * 	ngOnInit() {
   * 		LbrXManager.setDevToolsZone(this._zone)
   * 	}
   * `Other:`
   * LbrXManager.setDevToolsZone(someZoneHandler)
   */
  static setDevToolsZone(
    zone: ZoneLike
  ): typeof LbrXManager {
    if (!LbrXManager._devToolsManager) {
      logError('DevTools must be initialized before setting DevTools Zone.')
    } else {
      LbrXManager._devToolsManager.setDevToolsZone(zone)
    }
    return LbrXManager
  }

  private constructor() { }
}
