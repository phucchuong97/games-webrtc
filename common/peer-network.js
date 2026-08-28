/*
 * PeerNetwork
 *
 * Common WebRTC (PeerJS) transport shared by every game in this repo.
 *
 * A game only needs to:
 *   - pick a short prefix (used to namespace room codes into peer IDs)
 *   - listen for events: "open", "connected", "data", "close",
 *     "reconnecting", "error"
 *   - call .host() or .join(roomCode) to start
 *   - call .send(message) with its own message protocol
 *
 * Everything about who owns the authoritative state, what a "move"
 * looks like, etc. is entirely up to the game.
 *
 * If the data connection drops, this transparently retries with
 * backoff (see _handleDisconnect()) rather than surfacing "close"
 * right away - "reconnecting" fires immediately, and "connected"
 * fires again on success. "close" now only means the retries were
 * exhausted and the connection is truly gone.
 */

class PeerNetwork {

    constructor(gamePrefix) {

        this.gamePrefix = gamePrefix;

        this.peer = null;
        this.connection = null;

        this.role = null; // "HOST" | "GUEST"
        this.roomCode = null;

        this.handlers = {
            open: [],
            connected: [],
            data: [],
            close: [],
            reconnecting: [],
            error: []
        };

        // Auto-reconnect state - see _handleDisconnect().
        this._reconnecting = false;
        this._reconnectAttempts = 0;
        this._reconnectTimer = null;
        this._maxReconnectAttempts = 20;
    }


    on(event, handler) {

        if (!this.handlers[event]) {
            this.handlers[event] = [];
        }

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

        this.roomCode = roomCode;

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
            error => this._handlePeerError(error)
        );

        return roomCode;
    }


    /*
     * Join an existing room as guest.
     */

    join(roomCode) {

        this.role = "GUEST";
        this.roomCode = roomCode;

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
            error => this._handlePeerError(error)
        );
    }


    _bindConnection() {

        this.connection.on(
            "open",
            () => {

                this._reconnecting = false;
                this._reconnectAttempts = 0;

                if (this._reconnectTimer) {

                    clearTimeout(this._reconnectTimer);
                    this._reconnectTimer = null;
                }

                this._emit("connected");
            }
        );

        this.connection.on(
            "data",
            message => this._emit("data", message)
        );

        this.connection.on(
            "close",
            () => this._handleDisconnect()
        );

        this.connection.on(
            "error",
            error => this._emit("error", error)
        );
    }


    /*
     * The data connection dropped - most likely a network blip rather
     * than a deliberate "leave" (this app has no such feature - the
     * only way a connection closes is the underlying transport dying).
     *
     * Rather than declaring the game over immediately, try to
     * re-establish the connection with backoff for a while before
     * giving up. A retry already in progress (a further "close" from a
     * failed reconnect attempt) is ignored so the backoff counter isn't
     * reset each time - see _attemptReconnect().
     */

    _handleDisconnect() {

        if (this._reconnecting) {
            return;
        }

        this.connection = null;

        this._reconnecting = true;
        this._reconnectAttempts = 0;

        this._emit("reconnecting");

        this._scheduleReconnectAttempt();
    }


    _scheduleReconnectAttempt() {

        if (this._reconnectAttempts >= this._maxReconnectAttempts) {

            this._reconnecting = false;

            this._emit("close");

            return;
        }

        this._reconnectAttempts++;

        const delay = Math.min(1000 * this._reconnectAttempts, 5000);

        this._reconnectTimer = setTimeout(
            () => this._attemptReconnect(),
            delay
        );
    }


    _attemptReconnect() {

        if (!this._reconnecting) {
            return;
        }

        if (this.peer.disconnected && !this.peer.destroyed) {

            const onOpen = () => {

                this.peer.off("open", onOpen);

                if (!this.isHost) {
                    this._connectToHost();
                }
            };

            this.peer.on("open", onOpen);
            this.peer.reconnect();

        } else if (!this.isHost) {

            /*
             * HOST doesn't actively redial - the "connection" listener
             * bound in host() already picks up the guest's next
             * incoming connection attempt. GUEST has to be the one to
             * redial the host's (fixed) peer ID.
             */

            this._connectToHost();
        }

        this._scheduleReconnectAttempt();
    }


    _connectToHost() {

        this.connection = this.peer.connect(
            this._peerId(this.roomCode),
            { reliable: true }
        );

        this._bindConnection();
    }


    /*
     * While a reconnect attempt is in flight, failures (e.g. the other
     * side isn't back online yet) are expected and noisy - surfacing
     * every one as a user-facing error/alert would spam the player
     * throughout the whole retry window. "reconnecting"/"close" already
     * communicate the connection state, so transient errors are
     * swallowed here and only reported once we're not retrying.
     */

    _handlePeerError(error) {

        if (this._reconnecting) {
            return;
        }

        this._emit("error", error);
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
