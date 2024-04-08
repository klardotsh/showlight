export enum Origin {
	SCOREKEEPER = 'scorekeeper',
	SHOW = 'show',
}

export enum Kind {
	POTENTIAL_CARD = 'potential_card',
	SCORES_READY = 'scores_ready',
	SHOW_CLEAR = 'show_clear',
	STRETCH_FOR_TIME = 'stretch_for_time',
	WIND_DOWN = 'wind_down',
	HALT = 'halt',
}

export type PotentialCard = {
	"origin": Origin.SCOREKEEPER,
	"kind": Kind.POTENTIAL_CARD,
}

export type ScoresReady = {
	"origin": Origin.SCOREKEEPER,
	"kind": Kind.SCORES_READY,
}

export type ShowClear = {
	"origin": Origin.SHOW,
	"kind": Kind.SHOW_CLEAR,
}

export type StretchForTime = {
	"origin": Origin.SHOW,
	"kind": Kind.STRETCH_FOR_TIME,
}

export type WindDown = {
	"origin": Origin.SHOW,
	"kind": Kind.WIND_DOWN,
}

export type Halt = {
	"origin": Origin.SHOW,
	"kind": Kind.HALT,
}

export type ScorekeepingLight =
	| PotentialCard
	| ScoresReady

export type ShowLight =
	| ShowClear
	| StretchForTime
	| WindDown
	| Halt

export type StackLight =
	| ScorekeepingLight
	| ShowLight
