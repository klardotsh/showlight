import { StackLight, ScorekeepingLight } from './lights'

export interface BroadcastResponse {
	show_light_state: StackLight | null
	sk_light_state: ScorekeepingLight | null
}


