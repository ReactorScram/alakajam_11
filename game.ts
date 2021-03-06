declare let TileMaps: Object;

const canvas_element = <HTMLCanvasElement> document.getElementById ("QR4YH2UP");
const ctx = canvas_element.getContext ('2d')!;

function resize_canvas (width: number, height: number){
	canvas_element.width = width;
	canvas_element.height = height;
	
	draw (game_state);
}

let raf_id: number | null = null;
let last_ms: number | null = null;
let throbber_frame: number = 0;
let fps_num: number = 60;
let fps_den: number = 1000;
let timestep_accum: number = fps_den / 2;

const state_1_waiting = "1 waiting";
const state_2_playing = "2 playing";
const state_3_touched_cup = "3 touched cup";
const state_4_victory_dance = "4 victory dance";
const state_5_flee = "5 flee";
const state_6_boulder_beat = "6 boulder beat";
const state_7_boulder = "7 boulder";
const state_8_victory = "8 victory";

const map_playlist = [
	"tutorial",
	"map_1",
	"map_2",
];
let map_index = 0;

class TileInfo {
	sprite: string = "";
	lara_can_walk: boolean = false;
	kristie_can_walk: boolean = false;
	
	constructor (n: number) {
		if (n == 2) {
			this.sprite = "tile-ruins";
			this.lara_can_walk = true;
			this.kristie_can_walk = true;
		}
		else if (n == 4) {
			this.sprite = "door-staff";
			this.kristie_can_walk = true;
		}
		else if (n == 5) {
			this.sprite = "tile-backrooms";
			this.kristie_can_walk = true;
		}
		else if (n == 6) {
			// Door
			this.sprite = "tile-ruins";
			this.lara_can_walk = true;
			this.kristie_can_walk = true;
		}
		else if (n == 7) {
			this.sprite = "tile-ruins-crud";
			this.lara_can_walk = true;
			this.kristie_can_walk = true;
		}
	}
}

let last_entity = 0;
let garbage_counter = 0;

function create_entity () {
	last_entity += 1;
	return last_entity;
}

class PosComponent {
	x: number;
	y: number;
	
	constructor (x: number, y: number) {
		this.x = x;
		this.y = y;
	}
	
	clone (): PosComponent {
		return new PosComponent (this.x, this.y);
	}
	
	dist2 (o: PosComponent): number {
		const diff_x = this.x - o.x;
		const diff_y = this.y - o.y;
		
		return diff_x * diff_x + diff_y * diff_y;
	}
}

class SpriteComponent {
	name: string | null;
	name_func: (() => string | null) | null = null;
	
	offset_x: number;
	offset_y: number;
	
	constructor (name: string, offset_x: number, offset_y: number) {
		this.name = name;
		this.offset_x = offset_x;
		this.offset_y = offset_y;
	}
}

class DoorComponent {
	open: boolean;
	
	constructor (open: boolean) {
		this.open = open;
	}
}

class ButtonComponent {
	door: number;
	
	constructor (door: number) {
		this.door = door;
	}
}

class CupComponent {
	spawns_boulder: boolean = false;
}

interface Ecs {
	state: string;
	transition_timer: number;
	
	map_width: number;
	
	cups: Map <number, CupComponent>;
	doors: Map <number, DoorComponent>;
	holders: Map <number, HolderComponent>;
	laras: Map <number, LaraComponent>;
	positions: Map <number, PosComponent>;
	sprites: Map <number, SpriteComponent>;
	snakes: Map <number, SnakeComponent>;
	
	goal_map: Map <number, number>;
	lara_ant_trail: Map <number, number []>;
	
	nearest_entity (actor: number, map: Map <number, any>, radius: number): number | null;
}

class SnakeComponent {
	held_by: number | null;
	anim_timer: number = 0;
	alive: boolean = true;
	
	constructor () {
		this.held_by = null;
	}
	
	step_held (ecs: Ecs, entity: number) {
		const held_by = this.held_by;
		if (typeof (held_by) != "number") {
			return;
		}
		
		const holder_pos = ecs.positions.get (held_by);
		if (! holder_pos) {
			return;
		}
		
		const holder = ecs.holders.get (held_by);
		if (! holder) {
			return;
		}
		
		const snake_pos = ecs.positions.get (entity);
		if (! snake_pos) {
			return;
		}
		
		const snake_sprite = ecs.sprites.get (entity);
		if (! snake_sprite) {
			return;
		}
		
		snake_sprite.name = "snake-1";
		this.anim_timer = 0;
		
		const hold_dist = 16;
		
		snake_pos.x = holder_pos.x + holder.dir_x * hold_dist;
		snake_pos.y = holder_pos.y + holder.dir_y * hold_dist;
	}
	
	step_free (ecs: Ecs, entity: number) {
		const snake_pos = ecs.positions.get (entity);
		if (! snake_pos) {
			return;
		}
		
		const snake_sprite = ecs.sprites.get (entity);
		if (! snake_sprite) {
			return;
		}
		
		const lara = ecs.nearest_entity (entity, ecs.laras, 5 * 32);
		if (typeof (lara) != "number") {
			return;
		}
		
		const lara_pos = ecs.positions.get (lara);
		if (! lara_pos) {
			return;
		}
		
		if (snake_pos.dist2 (lara_pos) >= Math.pow (5 * 32, 2)) {
			return;
		}
		
		if (lara_pos.x < snake_pos.x) {
			const snake_speed: number = 0.0;
			
			snake_pos.x -= snake_speed;
			
			this.anim_timer -= 1;
			if (this.anim_timer <= 0) {
				this.anim_timer = 60;
			}
			
			if (this.anim_timer >= 30) {
				snake_sprite.name = "snake-2";
			}
			else {
				snake_sprite.name = "snake-1";
			}
		}
		else {
			snake_sprite.name = "snake-1";
			this.anim_timer = 0;
		}
	}
	
	fixed_step (ecs: Ecs, entity: number) {
		if (this.held_by === null) {
			this.step_free (ecs, entity);
		}
		else {
			this.step_held (ecs, entity);
		}
	}
}

class SnakeSpawnerComponent {
	timer: number = 1000;
	
	fixed_step (ecs: Ecs, entity: number) {
		const spawner_pos = ecs.positions.get (entity);
		if (! spawner_pos) {
			return;
		}
		
		const nearest_snake = ecs.nearest_entity (entity, ecs.snakes, 32);
		if (! nearest_snake) {
			this.timer += 1;
			if (this.timer >= 120 && ecs.snakes.size < 10) {
				let snake = create_entity ();
				ecs.positions.set (snake, spawner_pos.clone ());
				ecs.sprites.set (snake, new SpriteComponent ("snake-1", -32 / 2, -32 / 2));
				ecs.snakes.set (snake, new SnakeComponent ());
			}
		}
		else {
			this.timer = 0;
		}
	}
}

class LaraComponent {
	walk_towards (ecs: Ecs, entity: number, direction: number [], speed: number) {
		const lara_pos = ecs.positions.get (entity)!;
		
		const tile_x = Math.floor (lara_pos.x / 32);
		const tile_y = Math.floor (lara_pos.y / 32);
		
		let move_vec = [direction [0], direction [1]];
		
		const intra_x = lara_pos.x - tile_x * 32;
		const intra_y = lara_pos.y - tile_y * 32;
		
		const corner_margin = 12;
		
		if (move_vec [0] == 0) {
			if (intra_x < corner_margin) {
				move_vec [0] = 1;
			}
			else if (intra_x > 32 - corner_margin) {
				move_vec [0] = -1;
			}
		}
		if (move_vec [1] == 0) {
			if (intra_y < corner_margin) {
				move_vec [1] = 1;
			}
			else if (intra_y > 32 - corner_margin) {
				move_vec [1] = -1;
			}
		}
		
		const move_dist2 = move_vec [0] * move_vec [0] + move_vec [1] * move_vec [1];
		if (move_dist2 > 0) {
			const move_dist = Math.sqrt (move_dist2);
			move_vec = [move_vec [0] / move_dist, move_vec [1] / move_dist];
			
			lara_pos.x += move_vec [0] * speed;
			lara_pos.y += move_vec [1] * speed;
		}
	}
	
	step_flee (ecs: Ecs, entity: number, speed: number) {
		const lara_pos = ecs.positions.get (entity)!;
		
		const tile_x = Math.floor (lara_pos.x / 32);
		const tile_y = Math.floor (lara_pos.y / 32);
		const index_me = tile_y * ecs.map_width + tile_x;
		
		const flee_to = ecs.lara_ant_trail.get (index_me);
		if (! flee_to) {
			ecs.state = state_8_victory;
			ecs.transition_timer = 120;
			for (const [entity, cup] of ecs.cups) {
				const sprite = ecs.sprites.get (entity)!;
				sprite.name = "boulder-dead";
				sprite.name_func = null;
			}
			return;
		}
		
		const flee_dir = [
			flee_to [0] - tile_x,
			flee_to [1] - tile_y
		];
		
		this.walk_towards (ecs, entity, flee_dir, speed);
	}
	
	step_normal (game_state: GameState, entity: number) {
		const ecs = game_state.level_state;
		const lara_pos = ecs.positions.get (entity)!;
		
		const tile_x = Math.floor (lara_pos.x / 32);
		const tile_y = Math.floor (lara_pos.y / 32);
		const index_me = tile_y * ecs.map_width + tile_x;
		const dist_me = ecs.goal_map.get (index_me)!;
		
		const neighbors = [
			[tile_x - 1, tile_y    ],
			[tile_x + 1, tile_y    ],
			[tile_x    , tile_y - 1],
			[tile_x    , tile_y + 1],
		];
		
		let best_dist = dist_me;
		let best_direction = [0, 0];
		
		if (best_dist == 0) {
			ecs.state = state_3_touched_cup;
			ecs.transition_timer = 30;
			return;
		}
		
		// Check for doors blocking our path
		
		let blocked_tiles: Map <number, number> = new Map ();
		for (const [door_e, door] of ecs.doors) {
			if (! door.open) {
				const pos = ecs.positions.get (door_e)!;
				const x = Math.floor (pos.x / 32);
				const y = Math.floor (pos.y / 32);
				const index = y * ecs.map_width + x;
				
				blocked_tiles.set (index, door_e);
			}
		}
		
		// Check for snakes
		
		for (const [snake_e, snake] of ecs.snakes) {
			if (snake.alive) {
				const pos = ecs.positions.get (snake_e)!;
				const x = Math.floor (pos.x / 32);
				const y = Math.floor (pos.y / 32);
				const index = y * ecs.map_width + x;
				
				blocked_tiles.set (index, snake_e);
			}
		}
		
		// Deduct points for garbage
		
		const garbage_e = ecs.nearest_entity (entity, ecs.garbages, 32);
		if (typeof (garbage_e) == "number") {
			const garbage = ecs.garbages.get (garbage_e)!;
			if (! garbage.cleaned && ! garbage.lara_touched) {
				garbage.lara_touched = true;
				game_state.points -= 1;
			}
		}
		
		// Walks towards the valuable cup
		
		for (const [n_x, n_y] of neighbors) {
			const index_nay = n_y * ecs.map_width + n_x;
			const dist_nay = ecs.goal_map.get (index_nay);
			
			if (typeof (dist_nay) != "number") {
				continue;
			}
			
			if (typeof (blocked_tiles.get (index_nay)) == "number") {
				continue;
			}
			
			if (dist_nay < best_dist) {
				best_dist = dist_nay;
				best_direction = [n_x - tile_x, n_y - tile_y];
				
				ecs.lara_ant_trail.set (index_nay, [tile_x, tile_y]);
			}
		}
		
		this.walk_towards (ecs, entity, best_direction, 2.0);
	}
	
	fixed_step (game_state: GameState, entity: number) {
		const lvl = game_state.level_state;
		
		if (lvl.state == state_1_waiting) {
			
		}
		else if (lvl.state == state_2_playing) {
			this.step_normal (game_state, entity);
		}
		else if (lvl.state == state_3_touched_cup) {
			
		}
		else if (lvl.state == state_4_victory_dance) {
			
		}
		else if (lvl.state == state_5_flee) {
			this.step_flee (lvl, entity, 2.0);
		}
		else if (lvl.state == state_6_boulder_beat) {
			
		}
		else if (lvl.state == state_7_boulder) {
			this.step_flee (lvl, entity, 4.0);
		}
		else if (lvl.state == state_8_victory) {
			
		}
	}
}

class GarbageComponent {
	cleaned: boolean = false;
	lara_touched: boolean = false;
}

class HolderComponent {
	holding: number | null;
	dir_x: number;
	dir_y: number;
	
	constructor () {
		this.holding = null;
	}
}

class LevelState {
	state: string = state_1_waiting;
	transition_timer: number = 0;
	
	map_width: number = 1;
	map_data: Uint8Array;
	
	// Fixed root entities
	
	kristie: number;
	
	cups: Map <number, CupComponent> = new Map ();
	buttons: Map <number, ButtonComponent> = new Map ();
	doors: Map <number, DoorComponent> = new Map ();
	garbages: Map <number, GarbageComponent> = new Map ();
	holders: Map <number, HolderComponent> = new Map ();
	laras: Map <number, LaraComponent> = new Map ();
	positions: Map <number, PosComponent> = new Map ();
	snakes: Map <number, SnakeComponent> = new Map ();
	snake_spawners: Map <number, SnakeSpawnerComponent> = new Map ();
	sprites: Map <number, SpriteComponent> = new Map ();
	
	goal_map: Map <number, number>;
	lara_ant_trail: Map <number, number []> = new Map ();
	
	constructor (map) {
		this.map_width = map.width;
		this.map_data = new Uint8Array (window.atob (map.layers [0].data).split("").map(function(c) {
			return c.charCodeAt(0); 
		}));
		
		const map_objects = map.layers [1];
		
		// From Tiled ID to game ID
		
		const id_map: Map <number, number> = new Map ();
		
		// Create all objects
		
		for (const obj of map_objects.objects) {
			const tiled_id = obj ["id"];
			const x = obj ["x"];
			const y = obj ["y"];
			const tiled_type = obj ["type"];
			
			const snapped_x = Math.floor (x / 32) * 32 + 16;
			const snapped_y = Math.floor (y / 32) * 32 + 16;
			
			const e = create_entity ();
			const pos = new PosComponent (x, y);
			const snapped_pos = new PosComponent (snapped_x, snapped_y);
			//const snapped_pos = pos;
			
			this.positions.set (e, snapped_pos);
			
			if (tiled_type == "door") {
				const door = new DoorComponent (false);
				const sprite = new SpriteComponent ("placeholder-door", -32 / 2, -32 / 2);
				
				sprite.name_func = function () {
					if (door.open) {
						return "door-open";
					}
					else {
						return "placeholder-door";
					}
				};
				
				this.sprites.set (e, sprite);
				this.doors.set (e, door);
				id_map.set (tiled_id, e);
			}
			else if (tiled_type == "button") {
				this.sprites.set (e, new SpriteComponent ("placeholder-button", -32 / 2, -32 / 2));
				id_map.set (tiled_id, e);
			}
			else if (tiled_type == "spawn_snakes") {
				this.snake_spawners.set (e, new SnakeSpawnerComponent ());
				this.snake_spawners.get (e)!.fixed_step (this, e);
				id_map.set (tiled_id, e);
			}
			else if (tiled_type == "cup") {
				const cup = new CupComponent ();
				
				for (const prop of obj ["properties"]) {
					if (prop ["name"] == "spawns_boulder") {
						cup.spawns_boulder = prop ["value"];
					}
				}
				
				this.cups.set (e, cup);
				this.sprites.set (e, new SpriteComponent ("cup", -32 / 2, -32 / 2));
			}
			else if (tiled_type == "garbage") {
				const garbage_sprites = [
					"garbage-burger",
					"garbage-newspaper",
					"garbage-torii",
				];
				
				this.garbages.set (e, new GarbageComponent ());
				this.sprites.set (e, new SpriteComponent (garbage_sprites [garbage_counter], -32 / 2, -32 / 2));
				
				garbage_counter += 1;
				if (garbage_counter > garbage_sprites.length) {
					garbage_counter = 0;
				}
			}
		}
		
		// Create Lara and Kristie in a second pass so they'll always be
		// on top
		
		for (const obj of map_objects.objects) {
			const tiled_id = obj ["id"];
			const x = obj ["x"];
			const y = obj ["y"];
			const tiled_type = obj ["type"];
			
			const e = create_entity ();
			const pos = new PosComponent (x, y);
			
			this.positions.set (e, pos);
			
			if (tiled_type == "spawn_lara") {
				this.sprites.set (e, new SpriteComponent ("lara", -32 / 2, -32 / 2));
				this.laras.set (e, new LaraComponent ());
				id_map.set (tiled_id, e);
			}
			else if (tiled_type == "spawn_kristie") {
				this.sprites.set (e, new SpriteComponent ("kristie", -32 / 2, -32 / 2));
				this.holders.set (e, new HolderComponent ());
				this.kristie = e;
				id_map.set (tiled_id, e);
			}
		}
		
		// Link up objects using id_map
		
		for (const obj of map_objects.objects) {
			const tiled_id = obj ["id"];
			const tiled_type = obj ["type"];
			const game_id = id_map.get (tiled_id);
			if (typeof (game_id) != 'number') {
				continue;
			}
			
			if (tiled_type == "button") {
				for (const prop of obj ["properties"]) {
					if (prop ["name"] == "controls") {
						const controlled_tiled_id = prop ["value"];
						const controlled_game_id = id_map.get (controlled_tiled_id);
						if (typeof (controlled_game_id) != 'number') {
							continue;
						}
						
						this.buttons.set (game_id, new ButtonComponent (controlled_game_id));
					}
				}
			}
		}
		
		// Build pathfinding map
		
		this.goal_map = this.dijkstra ();
	}
	
	get_tile (x: number, y: number): TileInfo {
		const tile_x = Math.floor (x / 32);
		const tile_y = Math.floor (y / 32);
		const tile_index = tile_y * this.map_width + tile_x;
		
		return new TileInfo (this.map_data [tile_index * 4]);
	}
	
	dijkstra (): Map <number, number> {
		let goal_map: Map <number, number> = new Map ();
		let frontier_queue: Array <number []> = new Array ();
		
		// Set all goals to 0
		
		for (const [entity, cup] of this.cups) {
			const pos = this.positions.get (entity)!;
			const tile_x = Math.floor (pos.x / 32);
			const tile_y = Math.floor (pos.y / 32);
			const index = tile_y * this.map_width + tile_x;
			
			goal_map.set (index, 0);
			frontier_queue.push ([tile_x, tile_y]);
		}
		
		// Explore frontier
		
		while (frontier_queue.length > 0) {
			const [x, y] = frontier_queue.pop ()!;
			
			const index_me = (y * this.map_width + x);
			const dist_me = goal_map.get (index_me)!;
			
			const neighbors = [
				[x - 1, y    ],
				[x + 1, y    ],
				[x    , y - 1],
				[x    , y + 1],
			];
			
			for (const [n_x, n_y] of neighbors) {
				const index_nay = n_y * this.map_width + n_x;
				const tile = new TileInfo (this.map_data [index_nay * 4]);
				
				if (! tile.lara_can_walk) {
					continue;
				}
				
				let dist_nay = goal_map.get (index_nay);
				
				if (typeof (dist_nay) == "number") {
					if (dist_nay > dist_me + 1) {
						goal_map.set (index_nay, dist_me + 1);
						frontier_queue.push ([n_x, n_y]);
					}
				}
				else {
					goal_map.set (index_nay, dist_me + 1);
					frontier_queue.push ([n_x, n_y]);
				}
			}
		}
		
		return goal_map;
	}
	
	nearest_entity (actor: number, map: Map <number, any>, radius: number): number | null {
		const actor_pos = this.positions.get (actor)!;
		
		let nearest: number | null = null;
		let nearest_dist2: number | null = null;
		
		for (const [entity, button] of map) {
			const pos = this.positions.get (entity);
			if (! pos) {
				continue;
			}
			
			const dist2 = actor_pos.dist2 (pos);
			if (dist2 >= radius * radius) {
				continue;
			}
			
			if (nearest_dist2 == null) {
				nearest_dist2 = dist2;
				nearest = entity;
			}
			else if (dist2 < nearest_dist2) {
				nearest_dist2 = dist2;
				nearest = entity;
			}
		}
		
		return nearest;
	}
	
	can_toggle_button (actor: number): (() => void) | null {
		const nearest_button = this.nearest_entity (actor, this.buttons, 32);
		if (typeof (nearest_button) != "number") {
			return null;
		}
		
		const button = this.buttons.get (nearest_button);
		if (! button) {
			return null;
		}
		
		const door = this.doors.get (button.door);
		if (! door) {
			return null;
		}
		
		if (door.open) {
			return null;
		}
		
		const level = this;
		
		return function () {
			door.open = true;
			if (level.state == state_1_waiting) {
				level.state = state_2_playing;
			}
		};
	}
	
	can_destroy_garbage (actor: number): (() => void) | null {
		const nearest_e = this.nearest_entity (actor, this.garbages, 32);
		if (typeof (nearest_e) != "number") {
			return null;
		}
		
		const garbage = this.garbages.get (nearest_e)!;
		if (garbage.cleaned) {
			return null;
		}
		
		const that = this;
		return function () {
			const sprite = that.sprites.get (nearest_e);
			if (! sprite) {
				return null;
			}
			
			const garbage = that.garbages.get (nearest_e)!;
			if (garbage.cleaned) {
				return null;
			}
	
			sprite.name = null;
			garbage.cleaned = true;
		};
	}
	
	can_pick_snake (actor: number): (() => void) | null {
		const holder = this.holders.get (actor);
		if (! holder) {
			return null;
		}
		if (holder.holding != null) {
			return null;
		}
		
		const nearest_snake = this.nearest_entity (actor, this.snakes, 32);
		if (typeof (nearest_snake) != "number") {
			return null;
		}
		
		const snake = this.snakes.get (nearest_snake)!;
		
		return function () {
			snake.held_by = actor;
			holder.holding = nearest_snake;
		};
	}
	
	can_drop_snake (actor: number): (() => void) | null {
		const holder = this.holders.get (actor);
		if (! holder) {
			return null;
		}
		if (holder.holding == null) {
			return null;
		}
		
		const snake_e = holder.holding;
		
		const snake = this.snakes.get (snake_e);
		if (! snake) {
			return null;
		}
		
		const holder_pos = this.positions.get (actor)!;
		const snake_pos = this.positions.get (snake_e)!;
		
		return function () {
			snake.held_by = null;
			holder.holding = null;
			snake_pos.x = holder_pos.x;
			snake_pos.y = holder_pos.y;
		};
	}
}

class GameState {
	// Non-ECS stuff
	
	frame_count: number = 0;
	button_prompt: string = "";
	frames_moved: number = 0;
	
	level_state: LevelState;
	
	points: number = 0;
	
	load_map (name: string) {
		const map = TileMaps [name];
		this.level_state = new LevelState (map);
	}
	
	step (cow_gamepad: CowGamepad) {
		const lvl = this.level_state;
		
		this.frame_count += 1;
		
		const kristie_pos = lvl.positions.get (lvl.kristie)!;
		
		const move_vec = cow_gamepad.move_vec ();
		
		const kristie_holder = lvl.holders.get (lvl.kristie)!;
		
		if (move_vec [0] != 0 || move_vec [1] != 0) {
			kristie_holder.dir_x = move_vec [0];
			kristie_holder.dir_y = move_vec [1];
		}
		
		const kristie_speed: number = 2.0;
		
		const kristie_new_x = kristie_pos.x + kristie_speed * move_vec [0];
		const kristie_new_y = kristie_pos.y + kristie_speed * move_vec [1];
		const kristie_new_index = Math.floor (kristie_new_y / 32) * lvl.map_width + Math.floor (kristie_new_x / 32);
		
		let kristie_can_move = true;
		
		kristie_can_move = kristie_can_move && lvl.get_tile (kristie_new_x, kristie_new_y).kristie_can_walk;
		
		for (const [door_e, door] of lvl.doors) {
			if (! door.open) {
				const pos = lvl.positions.get (door_e)!;
				const x = Math.floor (pos.x / 32);
				const y = Math.floor (pos.y / 32);
				const index = y * lvl.map_width + x;
				
				if (index == kristie_new_index) {
					kristie_can_move = false;
				}
			}
		}
		
		if (kristie_can_move) {
			kristie_pos.x = kristie_new_x;
			kristie_pos.y = kristie_new_y;
			
			if (! (move_vec [0] == 0.0 && move_vec [1] == 0.0)) {
				this.frames_moved += 1;
			}
		}
		
		let action: (() => void) | null = null;
		
		if (action === null) {
			action = lvl.can_destroy_garbage (lvl.kristie);
			this.button_prompt = "Space: Destroy garbage";
		}
		if (action === null) {
			action = lvl.can_drop_snake (lvl.kristie);
			this.button_prompt = "Space: Drop snake";
		}
		if (action === null) {
			action = lvl.can_toggle_button (lvl.kristie);
			this.button_prompt = "Space: Open door";
		}
		if (action === null) {
			action = lvl.can_pick_snake (lvl.kristie);
			this.button_prompt = "Space: Pick up snake";
		}
		if (action === null) {
			if (this.frames_moved < 30) {
				this.button_prompt = "Arrow keys: Move";
			}
			else {
				this.button_prompt = "";
			}
		}
		
		if (cow_gamepad.action_x.just_pressed && action) {
			action ();
		}
		
		for (const [entity, lara] of lvl.laras) {
			lara.fixed_step (this, entity);
		}
		
		for (const [entity, snake] of lvl.snakes) {
			snake.fixed_step (lvl, entity);
		}
		
		for (const [entity, snake_spawner] of lvl.snake_spawners) {
			snake_spawner.fixed_step (lvl, entity);
		}
		
		if (lvl.transition_timer > 0) {
			lvl.transition_timer -= 1;
		}
		
		if (lvl.transition_timer <= 0) {
			if (lvl.state == state_3_touched_cup) {
				lvl.state = state_4_victory_dance;
				lvl.transition_timer = 60;
				
				for (const [entity, cup] of lvl.cups) {
					const sprite = lvl.sprites.get (entity)!;
					sprite.name = null;
				}
			}
			else if (lvl.state == state_4_victory_dance) {
				lvl.state = state_5_flee;
				lvl.transition_timer = 60;
			}
			else if (lvl.state == state_5_flee) {
				let boulders_should_spawn = false;
				
				for (const [e, cup] of lvl.cups) {
					if (cup.spawns_boulder) {
						boulders_should_spawn = true;
					}
				}
				
				if (boulders_should_spawn) {
					lvl.state = state_6_boulder_beat;
					lvl.transition_timer = 60;
					
					// I'm out of time, so the boulder is implemented as a cup
					// which is a Lara wearing a boulder suit.
					
					for (const [e, cup] of lvl.cups) {
						const sprite = lvl.sprites.get (e)!;
						sprite.name_func = function () {
							if (game_state.frame_count % 30 < 15) {
								return "boulder-1";
							}
							else {
								return "boulder-2";
							}
						};
						lvl.laras.set (e, new LaraComponent ());
					}
				}
				else {
					lvl.state = state_8_victory;
					lvl.transition_timer = 120;
				}
			}
			else if (lvl.state == state_6_boulder_beat) {
				lvl.state = state_7_boulder;
			}
			else if (lvl.state == state_8_victory) {
				map_index = Math.min (map_index + 1, map_playlist.length - 1);
				load_map (map_playlist [map_index]);
			}
		}
	}
}

let game_state = new GameState ();

function load_map (name: string) {
	game_state.load_map (name);
	draw (game_state);
}

let running: boolean = false;

let sprites: Map <string, ImageBitmap> = new Map ();

function get_sprite (name: string): ImageBitmap {
	return sprites [name];
}

class CowKey {
	down: boolean;
	just_pressed: boolean;
	
	constructor () {
		this.down = false;
		this.just_pressed = false;
	}
	
	down_or_just_pressed (): boolean {
		return this.down || this.just_pressed;
	}
	
	keydown () {
		this.just_pressed = true;
		this.down = true;
	}
	
	keyup () {
		this.down = false;
	}
	
	tick () {
		this.just_pressed = false;
	}
}

class CowGamepad {
	d_left: CowKey;
	d_right: CowKey;
	d_up: CowKey;
	d_down: CowKey;
	
	action_x: CowKey;
	
	constructor () {
		this.clear ();
	}
	
	clear () {
		this.d_left = new CowKey ();
		this.d_right = new CowKey ();
		this.d_up = new CowKey ();
		this.d_down = new CowKey ();
		this.action_x = new CowKey ();
	}
	
	move_vec (): number [] {
		let x = 0.0;
		let y = 0.0;
		
		if (this.d_left.down_or_just_pressed ()) {
			x -= 1.0;
		}
		if (this.d_right.down_or_just_pressed ()) {
			x += 1.0;
		}
		if (this.d_up.down_or_just_pressed ()) {
			y -= 1.0;
		}
		if (this.d_down.down_or_just_pressed ()) {
			y += 1.0;
		}
		
		const dist2 = x * x + y * y;
		
		if (dist2 > 1.0) {
			const dist = Math.sqrt (dist2);
			x = x / dist;
			y = y / dist;
		}
		
		return [x, y];
	}
	
	decode (code: string): CowKey | null {
		if (code == "ArrowDown") {
			return this.d_down;
		}
		else if (code == "ArrowUp") {
			return this.d_up;
		}
		if (code == "ArrowLeft") {
			return this.d_left;
		}
		else if (code == "ArrowRight") {
			return this.d_right;
		}
		else if (code == "Space") {
			return this.action_x;
		}
		else {
			console.log ("Unknown keycode " + code);
			return null;
		}
	}
	
	keydown (code: string) {
		const key = this.decode (code);
		if (key != null) {
			key.keydown ();
		}
	}
	
	keyup (code: string) {
		const key = this.decode (code);
		if (key != null) {
			key.keyup ();
		}
	}
	
	tick () {
		this.d_left.tick ();
		this.d_right.tick ();
		this.d_up.tick ();
		this.d_down.tick ();
		this.action_x.tick ();
	}
}

let cow_gamepad = new CowGamepad ();

canvas_element.addEventListener ("keydown", event => {
	if (event.isComposing || event.keyCode === 229) {
		return;
	}
	
	cow_gamepad.keydown (event.code);
	
	event.preventDefault ();
});

canvas_element.addEventListener ("keyup", event => {
	if (event.isComposing || event.keyCode === 229) {
		return;
	}
	
	cow_gamepad.keyup (event.code);
	
	event.preventDefault ();
});

canvas_element.addEventListener ("blur", event => {
	cow_gamepad.clear ();
	pause ();
});

canvas_element.addEventListener ("focus", event => {
	cow_gamepad.clear ();
	play ();
});

function fixed_step () {
	if (throbber_frame == 0) {
		throbber_frame = 1;
	}
	else {
		throbber_frame = 0;
	}
	
	game_state.step (cow_gamepad);
	
	cow_gamepad.tick ();
}

function draw_textbox (text: string, src_x: number, src_y: number) {
	const margin = 10;
	
	const metrics = ctx.measureText (text);
	
	const half_width = metrics.width / 2 + margin;
	const half_height = 20 / 2 + margin;
	
	const x = Math.floor (Math.max (half_width, Math.min (800 - half_width, src_x)));
	const y = Math.floor (Math.max (half_height, Math.min (600 - half_height, src_y)));
	
	ctx.fillStyle = "#00000080";
	ctx.fillRect (x - half_width, y - half_height, half_width * 2, half_height * 2);
	
	ctx.fillStyle = "#fff";
	ctx.textAlign = "center";
	ctx.fillText (text, x, y + 20 * 0.25);
}

function draw (game_state: GameState) {
	const scale: number = canvas_element.width / 800;
	const lvl = game_state.level_state;
	const kristie_pos = lvl.positions.get (lvl.kristie)!;
	
	ctx.resetTransform ();
	ctx.scale (scale, scale);
	
	// Background
	ctx.fillStyle = "#442434";
	ctx.fillRect (0, 0, 800, 600);
	
	const offset_x = Math.max (0, Math.min (4096 - 800, Math.floor (kristie_pos.x) - 400));
	const offset_y = Math.max (0, Math.min (4096 - 600, Math.floor (kristie_pos.y) - 300));
	
	ctx.translate (
		-offset_x, 
		-offset_y
	);
	
	function draw_sprite (name, x, y) {
		const s = get_sprite (name);
		if (s != null) {
			ctx.drawImage (s, x, y);
		}
	}
	
	// Tile map
	
	const tile_start_y = Math.floor (offset_y / 32) + 0;
	const tile_stop_y = tile_start_y + 20;
	const tile_start_x = Math.floor (offset_x / 32) + 0;
	const tile_stop_x = tile_start_x + 26;
	
	for (let y = tile_start_y; y < tile_stop_y; y++) {
		for (let x = tile_start_x; x < tile_stop_x; x++) {
			const index = y * lvl.map_width + x;
			const tile = lvl.map_data [index * 4];
			
			const info = new TileInfo (tile);
			
			if (info.sprite) {
				draw_sprite (info.sprite, x * 32, y * 32);
			}
			
			const dijkstra_num = lvl.goal_map.get (index);
			if (false && typeof (dijkstra_num) == "number") {
				ctx.font = "15px sans-serif";
				ctx.fillStyle = "#fff";
				ctx.textAlign = "center";
				
				ctx.fillText (String (dijkstra_num), x * 32 + 16, y * 32 + 20);
			}
		}
	}
	
	// Sprites from the ECS
	
	for (const [entity, sprite] of lvl.sprites) {
		const pos: PosComponent = lvl.positions.get (entity)!;
		
		if (pos == null) {
			return;
		}
		
		let name = sprite.name;
		if (sprite.name_func) {
			name = sprite.name_func ();
		}
		
		if (name === null) {
			continue;
		}
		draw_sprite (name, Math.floor (pos.x + sprite.offset_x), Math.floor (pos.y + sprite.offset_y));
	}
	
	// UI
	
	ctx.resetTransform ();
	ctx.scale (scale, scale);
	
	ctx.font = "20px sans-serif";
	
	const button_prompt = game_state.button_prompt;
	if (button_prompt) {
		draw_textbox (button_prompt, kristie_pos.x - offset_x, kristie_pos.y + 40 - offset_y);
	}
	
	if (lvl.state == state_8_victory) {
		draw_textbox ("Level complete!", 400, 300);
	}
	
	draw_textbox ("Points: " + String (game_state.points), 0, 0);
	
	if (false) {
		ctx.fillStyle ="#000";
		
		if (throbber_frame == 0) {
			ctx.fillRect(5, 5, 10, 10);
		}
		else {
			ctx.fillRect(15, 5, 10, 10);
		}
	}
	
	if (! running) {
		ctx.fillStyle = "#000000a0";
		ctx.fillRect (800 / 2 - 180 / 2, 600 / 2 - 50 / 2, 180, 50);
		
		ctx.fillStyle = "#fff";
		ctx.textAlign = "center";
		ctx.fillText ("Click to resume", 800 / 2, 600 / 2 + 20 * 0.25);
	}
}

function cancel_raf () {
	timestep_accum = fps_den / 2;
	last_ms = null;
	if (raf_id != null) {
		window.cancelAnimationFrame (raf_id);
		raf_id = null;
	}
}

function step (now_ms: number) {
	if (last_ms == null) {
		last_ms = now_ms;
	}
	
	let delta_ms = now_ms - last_ms;
	timestep_accum += delta_ms * fps_num;
	let logic_steps = 0;
	while (timestep_accum >= fps_den) {
		logic_steps += 1;
		timestep_accum -= fps_den;
	}
	if (logic_steps > 3) {
		logic_steps = 0;
	}
	last_ms = now_ms;
	
	for (let i = 0; i < logic_steps; i++) {
		fixed_step ();
	}
	
	draw (game_state);
	
	if (running) {
		raf_id = window.requestAnimationFrame (step);
	}
}

function set_running (b: boolean) {
	running = b;
	(<HTMLInputElement> document.getElementById ("SLPOFAAK")).disabled =   running;
	(<HTMLInputElement> document.getElementById ("HCNSQXRP")).disabled = ! running;
}

function play () {
	canvas_element.focus ();
	set_running (true);
	cancel_raf ();
	raf_id = window.requestAnimationFrame (step);
}

function pause () {
	set_running (false);
	draw (game_state);
}

load_map (map_playlist [map_index]);

set_running (false);

const sprite_names: string [] = [
	"boulder-1",
	"boulder-2",
	"boulder-dead",
	"cup",
	"door-glow",
	"door-open",
	"door-staff",
	"garbage-burger",
	"garbage-newspaper",
	"garbage-torii",
	"kristie",
	"lara",
	"placeholder-button",
	"placeholder-closed-tile",
	"placeholder-door",
	"placeholder-map",
	"placeholder-open-tile",
	"snake-1",
	"snake-2",
	"snake-dead",
	"tile-backrooms",
	"tile-ruins",
	"tile-ruins-crud",
];

for (const name of sprite_names) {
	const img = new Image ();
	img.src = "assets/png/" + name + ".png";
	img.decode ()
	.then (() => {
		createImageBitmap (img)
		.then ((value) => {
			sprites [name] = value;
			draw (game_state);
		});
	});
}

