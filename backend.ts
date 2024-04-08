import { env } from 'process'

import cors from 'cors'
import express from 'express'
import sqlite3 from 'better-sqlite3'

import { BroadcastResponse } from './serialization'
import { Origin, Kind, ShowLight, ScorekeepingLight } from './lights'

const PORT = parseInt(env.PORT || '9000')
const DB = sqlite3('showlight.db')
DB.pragma('journal_mode = WAL')

const app = express()
app.use(cors())

interface LifePing {
	id: string | null
	last_seen: Date
}

interface State {
	connections: {
		sk: LifePing[]
		brd: LifePing[]
		dir: LifePing[]
		boh: LifePing[]
	}

	queued_segments: string[]
	brd_req_segment_within_3min: boolean

	show_light_state: ShowLight | null
	sk_light_state: ScorekeepingLight | null
}

const state: State = {
	connections: {
		sk: [],
		brd: [],
		dir: [],
		boh: [],
	},

	queued_segments: [],
	brd_req_segment_within_3min: false,

	show_light_state: null,
	sk_light_state: null,
}

app.get('/api/ping', (_, res) => {
	res.status(200)
	res.write(JSON.stringify({ok: true}))
})

app.get('/api/broadcast', (_, res) => {
	let body: BroadcastResponse = {
		show_light_state: state.show_light_state,
		sk_light_state: state.sk_light_state,
	}
	res.json(body)
})

app.post('/api/scorekeeper/clear', (_, res) => {
	state.sk_light_state = null
	state.show_light_state = null
	console.log(state)
	res.status(200)
	res.write(JSON.stringify({ok: true}))
})

app.post('/api/scorekeeper/scores_ready', (_, res) => {
	state.sk_light_state = { "origin": Origin.SCOREKEEPER, "kind": Kind.SCORES_READY }
	console.log(state)
	res.status(200)
	res.write(JSON.stringify({ok: true}))
})

app.post('/api/scorekeeper/potential_card', (_, res) => {
	state.sk_light_state = { "origin": Origin.SCOREKEEPER, "kind": Kind.POTENTIAL_CARD }
	console.log(state)
	res.status(200)
	res.write(JSON.stringify({ok: true}))
})

app.post('/api/scorekeeper/show_go', (_, res) => {
	state.show_light_state = { "origin": Origin.SHOW, "kind": Kind.SHOW_CLEAR }
	console.log(state)
	res.status(200)
	res.write(JSON.stringify({ok: true}))
})

app.post('/api/scorekeeper/show_halt', (_, res) => {
	state.show_light_state = { "origin": Origin.SHOW, "kind": Kind.HALT }
	console.log(state)
	res.status(200)
	res.write(JSON.stringify({ok: true}))
})

app.get('/api/director', (req, res) => {})

app.get('/api/boh', (req, res) => {})

app.listen(PORT, '0.0.0.0')
