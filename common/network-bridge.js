/*
 * NetworkBridge
 *
 * Drop-in stand-in for PeerNetwork, used by a game when it's running
 * embedded inside the game-menu shell's iframe (see root index.html).
 *
 * The shell is the one that owns the single real PeerJS connection so
 * it survives switching between games. This bridge just relays
 * messages to/from the shell over postMessage, exposing the same
 * public surface (on/send/isHost/connection) so game code written
 * against PeerNetwork works unchanged whether it's running standalone
 * or embedded.
 */

class NetworkBridge {

    constructor() {

        this.role = null; // set once the shell replies with "init"
        this.connection = null;

        this.handlers = {
            open: [],
            connected: [],
            data: [],
            close: [],
            reconnecting: [],
            error: []
        };

        window.addEventListener(
            "message",
            event => this._handleShellMessage(event)
        );

        window.parent.postMessage(
            { source: "bridge", type: "ready" },
            "*"
        );
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


    send(data) {

        if (!this.connection || !this.connection.open) {
            return;
        }

        window.parent.postMessage(
            { source: "bridge", type: "send", payload: data },
            "*"
        );
    }


    /*
     * Ask the shell to switch back to the game-selection menu. Only
     * meaningful when embedded - standalone games just navigate away.
     */

    leaveToMenu() {

        window.parent.postMessage(
            { source: "bridge", type: "leave" },
            "*"
        );
    }


    _handleShellMessage(event) {

        const message = event.data;

        if (!message || message.source !== "shell") {
            return;
        }

        if (message.type === "init") {

            this.role = message.isHost ? "HOST" : "GUEST";
            this.connection = { open: true };

            this._emit("connected");

            return;
        }

        if (message.type === "data") {

            this._emit("data", message.payload);

            return;
        }

        if (message.type === "reconnecting") {

            this.connection = { open: false };

            this._emit("reconnecting");

            return;
        }

        if (message.type === "reconnected") {

            this.connection = { open: true };

            this._emit("connected");

            return;
        }

        if (message.type === "close") {

            this.connection = { open: false };

            this._emit("close");

            return;
        }

        if (message.type === "error") {

            this._emit("error", message.error);
        }
    }
}
