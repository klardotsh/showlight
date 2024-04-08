import { gretch, GretchResponse } from 'gretchen'
import EventEmitter from 'events'
import TypedEmitter from 'typed-emitter'

import { Kind } from './lights'
import { BroadcastResponse } from './serialization'

enum DomIDs {
	CONNECTION_MADE = 'connection-made',
	CONNECTION_NONE = 'connection-none',
	CONNECTION_NUKE = 'connection-nuke',

	FORM_CTRL_API = 'light-ctrl-api',
	FORM_CTRL_ADDR = 'ctrl-addr',
	FORM_CTRL_API_FAILED = 'light-ctrl-api-failed',
	FORM_CTRL_API_FAILED_REASON = 'light-ctrl-api-failed-reason',
	FORM_CTRL_API_SUBMIT = 'light-ctrl-api-submit',

	LIGHT_NOADDR = 'light-noaddr',
	LIGHT_CONNECTED = 'light-connected',
	LIGHT_SHOW_POTENTIAL_CARD = 'light-show-potential-card',
	LIGHT_SHOW_SCORES_READY = 'light-show-scores-ready',
	LIGHT_SHOW_GO = 'light-show-go',
	LIGHT_SHOW_STRETCH = 'light-show-stretch',
	LIGHT_SHOW_WIND_DOWN = 'light-show-wind-down',
	LIGHT_SHOW_HALT = 'light-show-halt',

	LIGHT_SHOW_GO_BTN = 'light-show-go-btn',
	LIGHT_SHOW_SCORES_BTN = 'light-show-scores-btn',
	LIGHT_SHOW_CARD_BTN = 'light-show-card-btn',
	LIGHT_SHOW_HALT_BTN = 'light-show-halt-btn',
	LIGHT_SK_CLEAR_BTN = 'light-sk-clear-btn',
	LIGHT_SHOW_GO_BTN_INNER = 'light-show-go-btn-inner',
	LIGHT_SHOW_SCORES_BTN_INNER = 'light-show-scores-btn-inner',
	LIGHT_SHOW_CARD_BTN_INNER = 'light-show-card-btn-inner',
	LIGHT_SHOW_HALT_BTN_INNER = 'light-show-halt-btn-inner',
	LIGHT_SK_CLEAR_BTN_INNER = 'light-sk-clear-btn-inner',

	LIGHT_HDR_SCORES = 'light-hdr-scores',
	LIGHT_HDR_CARD = 'light-hdr-card',
	LIGHT_HDR_GO = 'light-hdr-go',
	LIGHT_HDR_STRETCH = 'light-hdr-stretch',
	LIGHT_HDR_HALT = 'light-hdr-stretch',

	ROLE = 'role',
}

enum LSKeys {
	API_ADDRESS = 'api_address',
}

enum Role {
	BROADCAST = 'BRD',
	SCOREKEEPER = 'SK',
	DIRECTOR = 'DIR',
	BACK_OF_HOUSE = 'BOH',
}

function roleToApiEndpoint(role: Role): string {
	switch(role) {
		case Role.BROADCAST: return 'broadcast'
		case Role.SCOREKEEPER: return 'sk'
		case Role.DIRECTOR: return 'dir'
		case Role.BACK_OF_HOUSE: return 'boh'
	}
}

interface ClientState {
	apiAddress: string | null
	lifePingsFailed: number
	role: Role

	localUpdatePending: boolean

	cardUnDisableTimeout: NodeJS.Timeout | undefined
	scoresReadyUnDisableTimeout: NodeJS.Timeout | undefined
	goUnDisableTimeout: NodeJS.Timeout | undefined
	haltUnDisableTimeout: NodeJS.Timeout | undefined
}

type ShowlightEvents = {
	apiAddressConfigured: (address: string) => void
	apiConnectionNotConfigured: () => void
	lifePingSuccess: () => void
	lifePingFailure: () => void
	skLightState: (state: BroadcastResponse['sk_light_state']) => void
	showLightState: (state: BroadcastResponse['show_light_state']) => void
}

function hoistToWindowGlobal(name: string, it: unknown) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	;(<any>window)[`__sl_${name}`] = it
}

const messageEmitter = new EventEmitter() as TypedEmitter<ShowlightEvents>
hoistToWindowGlobal('messageEmmitter', messageEmitter)

// Instantiated in main() when page loads. This is a horrible atrocity against the entire premise
// of type safety and a violation of the Geneva Convention, I'm aware, but I think we'll survive.
let clientState: ClientState = undefined as unknown as ClientState
hoistToWindowGlobal('clientState', clientState)

// any here because I am truly lazy. https://youmightnotneedjquery.com/#ready
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ready(fn: any) {
	if (document.readyState !== 'loading') {
		fn()
	} else {
		document.addEventListener('DOMContentLoaded', fn)
	}
}

function domElementOrConsoleError(id: DomIDs): HTMLElement {
	const ele = document.getElementById(id)
	if (ele == null) {
		throw new Error(`Attempted to hide non-extant ID: ${id}`)
	}

	return ele
}

function safeDOMDisabledStateById(id: DomIDs, disabled: boolean) {
	;(<HTMLButtonElement>domElementOrConsoleError(id)).disabled = disabled
}

function safeDOMHiddenStateById(id: DomIDs, hidden: boolean) {
	domElementOrConsoleError(id).hidden = hidden
}

function safeDOMInnerText(id: DomIDs, text: string | undefined = undefined): string {
	if (typeof text !== 'undefined') {
		domElementOrConsoleError(id).innerText = text
		return text
	}

	return domElementOrConsoleError(id).innerText
}

function safeDOMValue(id: DomIDs, text: string | undefined = undefined): string {
	if (typeof text !== 'undefined') {
		;(<HTMLInputElement>domElementOrConsoleError(id)).value = text
		return text
	}

	return (<HTMLInputElement>domElementOrConsoleError(id)).value
}

function extractRoleFromPage(): Role {
	const roleValue = safeDOMInnerText(DomIDs.ROLE) as unknown as Role
	if (!Object.values(Role).includes(roleValue)) {
		const err = 'FATAL: Unknown role in title bar, refusing to load application'
		alert(err)
		throw new Error(err)
	}

	return roleValue
}

function apiAddressConfigured(address: string) {
	localStorage.setItem(LSKeys.API_ADDRESS, address)
	clientState.apiAddress = address

	gretch(`${clientState.apiAddress}/api/broadcast`).json().then((res: GretchResponse<BroadcastResponse, any>) => {
		localStorage.setItem(LSKeys.API_ADDRESS, address)
		clientState.apiAddress = address
		clientState.lifePingsFailed = 0

		safeDOMHiddenStateById(DomIDs.CONNECTION_NUKE, false)
		safeDOMHiddenStateById(DomIDs.CONNECTION_MADE, false)
		safeDOMHiddenStateById(DomIDs.CONNECTION_NONE, true)
		safeDOMHiddenStateById(DomIDs.LIGHT_NOADDR, true)

		if (clientState.role == Role.BROADCAST) {
			safeDOMHiddenStateById(DomIDs.LIGHT_CONNECTED, !(res.data?.sk_light_state === null && res.data?.show_light_state === null))
		} else {
			safeDOMHiddenStateById(DomIDs.LIGHT_CONNECTED, true)
		}
		safeDOMHiddenStateById(DomIDs.FORM_CTRL_API_FAILED, true)
		safeDOMHiddenStateById(DomIDs.FORM_CTRL_API_FAILED_REASON, true)
		safeDOMDisabledStateById(DomIDs.FORM_CTRL_API_SUBMIT, false)

		messageEmitter.emit('skLightState', res.data?.sk_light_state)
		messageEmitter.emit('showLightState', res.data?.show_light_state)
		// Lazy way to force pulling new state after we pull this state, endlessly in a loop. Should later do long polling.
		messageEmitter.emit('apiAddressConfigured', address)
		clientState.localUpdatePending = false
	})
}

function apiConnectionNotConfigured() {
	safeDOMHiddenStateById(DomIDs.CONNECTION_NUKE, false)
	safeDOMHiddenStateById(DomIDs.CONNECTION_MADE, true)
	safeDOMHiddenStateById(DomIDs.CONNECTION_NONE, false)
	safeDOMHiddenStateById(DomIDs.LIGHT_NOADDR, false)
}

function apiFormSubmitted(evt: SubmitEvent) {
	evt.preventDefault()
	safeDOMDisabledStateById(DomIDs.FORM_CTRL_API_SUBMIT, true)
	messageEmitter.emit('apiAddressConfigured', safeDOMValue(DomIDs.FORM_CTRL_ADDR))
}

function lifePingSuccess() {
	clientState.lifePingsFailed = 0
}

function lifePingFailure() {
	clientState.lifePingsFailed += 1
}

function nukeConnectionAndReload() {
	localStorage.removeItem(LSKeys.API_ADDRESS)
	window.location.reload()
}

function clearScoresReadyDisablingState() {
	if (clientState.scoresReadyUnDisableTimeout) {
		clearTimeout(clientState.scoresReadyUnDisableTimeout)
		clientState.scoresReadyUnDisableTimeout = undefined
		safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_SCORES_BTN_INNER, false)
	}
}

function clearShowCardDisablingState() {
	if (clientState.cardUnDisableTimeout) {
		clearTimeout(clientState.cardUnDisableTimeout)
		clientState.cardUnDisableTimeout = undefined
		safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_CARD_BTN_INNER, false)
	}
}
function clearShowGoDisablingState() {
	if (clientState.goUnDisableTimeout) {
		clearTimeout(clientState.goUnDisableTimeout)
		clientState.goUnDisableTimeout = undefined
		safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_GO_BTN_INNER, false)
	}
}
function clearHaltDisablingState() {
	if (clientState.haltUnDisableTimeout) {
		clearTimeout(clientState.haltUnDisableTimeout)
		clientState.haltUnDisableTimeout = undefined
		safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_HALT_BTN_INNER, false)
	}
}

function skLightState(state: BroadcastResponse['sk_light_state']) {
	switch (state?.kind) {
		case null:
		case undefined: {
			clearShowCardDisablingState()
			clearScoresReadyDisablingState()
			safeDOMHiddenStateById(DomIDs.LIGHT_NOADDR, true)
			safeDOMHiddenStateById(DomIDs.LIGHT_CONNECTED, true)
			safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_SCORES_READY, true)
			safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_POTENTIAL_CARD, true)
			break
		}
		case Kind.POTENTIAL_CARD: {
			clearScoresReadyDisablingState()
			safeDOMHiddenStateById(DomIDs.LIGHT_NOADDR, true)
			safeDOMHiddenStateById(DomIDs.LIGHT_CONNECTED, true)

			if (clientState.role == Role.BROADCAST) {
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_SCORES_READY, true)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_POTENTIAL_CARD, false)
			}

			if (clientState.role == Role.SCOREKEEPER && clientState.cardUnDisableTimeout === undefined) {
				safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_CARD_BTN_INNER, true)
				clientState.cardUnDisableTimeout = setTimeout(() => {
					safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_CARD_BTN_INNER, false)
					clientState.cardUnDisableTimeout = undefined
				}, 30000)
			}

			break
		}
		case Kind.SCORES_READY: {
			clearShowCardDisablingState()
			safeDOMHiddenStateById(DomIDs.LIGHT_NOADDR, true)
			safeDOMHiddenStateById(DomIDs.LIGHT_CONNECTED, true)

			if (clientState.role == Role.BROADCAST) {
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_SCORES_READY, false)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_POTENTIAL_CARD, true)
			}

			if (clientState.role == Role.SCOREKEEPER && clientState.scoresReadyUnDisableTimeout === undefined) {
				safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_SCORES_BTN_INNER, true)
				clientState.scoresReadyUnDisableTimeout = setTimeout(() => {
					safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_SCORES_BTN_INNER, false)
					clientState.scoresReadyUnDisableTimeout = undefined
				}, 30000)
			}

			break
		}
	}
}

function showLightState(state: BroadcastResponse['show_light_state']) {
	switch (state?.kind) {
		case null:
		case undefined: {
			clearShowGoDisablingState()
			clearHaltDisablingState()
			safeDOMHiddenStateById(DomIDs.LIGHT_NOADDR, true)
			safeDOMHiddenStateById(DomIDs.LIGHT_CONNECTED, true)
			if (clientState.role == Role.BROADCAST) {
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_GO, true)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_STRETCH, true)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_WIND_DOWN, true)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_HALT, true)
			}
			break
		}
		case Kind.SHOW_CLEAR: {
			clearHaltDisablingState()
			safeDOMHiddenStateById(DomIDs.LIGHT_NOADDR, true)
			safeDOMHiddenStateById(DomIDs.LIGHT_CONNECTED, true)
			if (clientState.role == Role.BROADCAST) {
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_GO, false)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_STRETCH, true)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_WIND_DOWN, true)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_HALT, true)
			}
			if (clientState.role == Role.SCOREKEEPER && clientState.goUnDisableTimeout === undefined) {
				safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_GO_BTN_INNER, true)
				clientState.goUnDisableTimeout = setTimeout(() => {
					safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_GO_BTN_INNER, false)
					clientState.goUnDisableTimeout = undefined
				}, 30000)
			}
			break
		}
		case Kind.STRETCH_FOR_TIME: {
			safeDOMHiddenStateById(DomIDs.LIGHT_NOADDR, true)
			safeDOMHiddenStateById(DomIDs.LIGHT_CONNECTED, true)
			if (clientState.role == Role.BROADCAST) {
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_GO, true)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_STRETCH, false)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_WIND_DOWN, true)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_HALT, true)
			}
			break
		}
		case Kind.WIND_DOWN: {
			safeDOMHiddenStateById(DomIDs.LIGHT_NOADDR, true)
			safeDOMHiddenStateById(DomIDs.LIGHT_CONNECTED, true)
			if (clientState.role == Role.BROADCAST) {
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_GO, true)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_STRETCH, true)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_WIND_DOWN, false)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_HALT, true)
			}
			break
		}
		case Kind.HALT: {
			clearShowGoDisablingState()
			safeDOMHiddenStateById(DomIDs.LIGHT_NOADDR, true)
			safeDOMHiddenStateById(DomIDs.LIGHT_CONNECTED, true)
			if (clientState.role == Role.BROADCAST) {
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_GO, true)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_STRETCH, true)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_WIND_DOWN, true)
				safeDOMHiddenStateById(DomIDs.LIGHT_SHOW_HALT, false)
			}
			if (clientState.role == Role.SCOREKEEPER && clientState.haltUnDisableTimeout === undefined) {
				safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_HALT_BTN_INNER, true)
				clientState.haltUnDisableTimeout = setTimeout(() => {
					safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_HALT_BTN_INNER, false)
					clientState.haltUnDisableTimeout = undefined
				}, 30000)
			}
			break
		}
	}
}

function skScoresReadyBtnClicked() {
	clientState.localUpdatePending = true
	safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_SCORES_BTN_INNER, true)
	gretch(`${clientState.apiAddress}/api/scorekeeper/scores_ready`, { method: 'POST' }).json().then(() => {
	})
}

function skClearBtnClicked() {
	gretch(`${clientState.apiAddress}/api/scorekeeper/clear`, { method: 'POST' }).json().then(() => {
	})
}

function skCardBtnClicked() {
	clientState.localUpdatePending = true
	safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_CARD_BTN_INNER, true)
	gretch(`${clientState.apiAddress}/api/scorekeeper/potential_card`, { method: 'POST' }).json().then(() => {
	})
}

function skGoBtnClicked() {
	clientState.localUpdatePending = true
	safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_GO_BTN_INNER, true)
	gretch(`${clientState.apiAddress}/api/scorekeeper/show_go`, { method: 'POST' }).json().then(() => {
	})
}

function skHaltBtnClicked() {
	clientState.localUpdatePending = true
	safeDOMDisabledStateById(DomIDs.LIGHT_SHOW_HALT_BTN_INNER, true)
	gretch(`${clientState.apiAddress}/api/scorekeeper/show_halt`, { method: 'POST' }).json().then(() => {
	})
}

function main() {
	clientState = {
		apiAddress: null,
		lifePingsFailed: 0,
		role: extractRoleFromPage(),

		localUpdatePending: false,
	}
	hoistToWindowGlobal('clientState', clientState)

	messageEmitter.on('apiAddressConfigured', apiAddressConfigured)
	messageEmitter.on('apiConnectionNotConfigured', apiConnectionNotConfigured)
	messageEmitter.on('lifePingSuccess', lifePingSuccess)
	messageEmitter.on('lifePingFailure', lifePingFailure)
	messageEmitter.on('skLightState', skLightState)
	messageEmitter.on('showLightState', showLightState)

	document
		.getElementById(DomIDs.CONNECTION_NUKE)
		?.addEventListener('click', nukeConnectionAndReload)

	document.getElementById(DomIDs.FORM_CTRL_API)?.addEventListener('submit', apiFormSubmitted)

	document.getElementById(DomIDs.LIGHT_SHOW_CARD_BTN_INNER)?.addEventListener('click', skCardBtnClicked)
	document.getElementById(DomIDs.LIGHT_SHOW_HALT_BTN_INNER)?.addEventListener('click', skHaltBtnClicked)
	document.getElementById(DomIDs.LIGHT_SHOW_SCORES_BTN_INNER)?.addEventListener('click', skScoresReadyBtnClicked)
	document.getElementById(DomIDs.LIGHT_SHOW_GO_BTN_INNER)?.addEventListener('click', skGoBtnClicked)
	document.getElementById(DomIDs.LIGHT_SK_CLEAR_BTN_INNER)?.addEventListener('click', skClearBtnClicked)

	const storedAddress = localStorage.getItem(LSKeys.API_ADDRESS)
	if (storedAddress != null) {
		safeDOMValue(DomIDs.FORM_CTRL_ADDR, storedAddress)
		safeDOMDisabledStateById(DomIDs.FORM_CTRL_API_SUBMIT, true)
		messageEmitter.emit('apiAddressConfigured', storedAddress)
	} else {
		messageEmitter.emit('apiConnectionNotConfigured')
	}
}

ready(main)
