/*
 * PeerNetwork
 *
 * Common WebRTC (PeerJS) transport shared by every game in this repo.
 *
 * A game only needs to:
 *   - pick a short prefix (used to namespace room codes into peer IDs)
 *   - listen for events: "open", "connected", "data", "close", "error"
 *   - call .host() or .join(roomCode) to start
 *   - call .send(message) with its own message protocol
 *
 * Everything about who owns the authoritative state, what a "move"
 * looks like, etc. is entirely up to the game.
 */

class PeerNetwork {

    constructor(gamePrefix) {

        this.gamePrefix = gamePrefix;

        this.peer = null;
        this.connection = null;

        this.role = null; // "HOST" | "GUEST"

        this.handlers = {
            open: [],
            connected: [],
            data: [],
            close: [],
            error: []
        };
    }


    on(event, handler) {

        this.handlers[event].push(handler);

        return this;
    }


    _emit(event, ...args) {

        this.handlers[event].forEach(
            handler => handler(...args)
        );
    }


    get isHost() {

        return this.role === "HOST";
    }


    /*
     * Become the host.
     *
     * Returns the generated room code immediately; the "open" event
     * fires once the underlying Peer connection is actually ready.
     */

    host() {

        this.role = "HOST";

        const roomCode = PeerNetwork.generateRoomCode();

        this.peer = new Peer(
            this._peerId(roomCode)
        );

        this.peer.on(
            "open",
            () => this._emit("open", roomCode)
        );

        this.peer.on(
            "connection",
            conn => {

                this.connection = conn;

                this._bindConnection();
            }
        );

        this.peer.on(
            "error",
            error => this._emit("error", error)
        );

        return roomCode;
    }


    /*
     * Join an existing room as guest.
     */

    join(roomCode) {

        this.role = "GUEST";

        this.peer = new Peer();

        this.peer.on(
            "open",
            myPeerId => {

                this.connection = this.peer.connect(
                    this._peerId(roomCode),
                    { reliable: true }
                );

                this._bindConnection();

                this._emit("open", myPeerId);
            }
        );

        this.peer.on(
            "error",
            error => this._emit("error", error)
        );
    }


    _bindConnection() {

        this.connection.on(
            "open",
            () => this._emit("connected")
        );

        this.connection.on(
            "data",
            message => this._emit("data", message)
        );

        this.connection.on(
            "close",
            () => this._emit("close")
        );

        this.connection.on(
            "error",
            error => this._emit("error", error)
        );
    }


    _peerId(roomCode) {

        return this.gamePrefix + "-" + roomCode.trim().toUpperCase();
    }


    send(data) {

        if (!this.connection || !this.connection.open) {
            return;
        }

        this.connection.send(data);
    }


    static generateRoomCode() {

        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

        let result = "";

        for (let i = 0; i < 6; i++) {

            result += chars[
                Math.floor(Math.random() * chars.length)
            ];
        }

        return result;
    }
}
