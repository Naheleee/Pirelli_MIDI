(() => {
    class LocalPresence {
        constructor(channel) {
            this.channel = channel;
            this.members = new Map();
            this.listeners = new Map();
            this.heartbeat = null;
        }

        subscribe(action, callback) {
            if (!this.listeners.has(action)) this.listeners.set(action, new Set());
            this.listeners.get(action).add(callback);
        }

        enter(data) {
            this.channel.client._updatePresence(this.channel.name, 'enter', data);
            if (this.heartbeat === null) {
                this.heartbeat = window.setInterval(() => {
                    this.channel.client._updatePresence(this.channel.name, 'update', data);
                }, 2000);
            }
            return Promise.resolve();
        }

        leave() {
            if (this.heartbeat !== null) {
                window.clearInterval(this.heartbeat);
                this.heartbeat = null;
            }
            this.channel.client._updatePresence(this.channel.name, 'leave');
            return Promise.resolve();
        }

        get() {
            return new Promise(resolve => {
                window.setTimeout(() => {
                    this.channel.client._prunePresence(this.channel.name);
                    resolve([...this.members.values()].map(({ connectionId, clientId, data }) => ({
                        connectionId,
                        clientId,
                        data
                    })));
                }, 60);
            });
        }

        _receive(action, member) {
            const key = `${member.connectionId}:${member.clientId}`;
            if (action === 'leave') {
                if (!this.members.delete(key)) return;
            } else {
                this.members.set(key, { ...member, lastSeen: Date.now() });
            }
            for (const listener of this.listeners.get(action) || []) {
                listener({ ...member });
            }
        }

        _prune() {
            const expiredBefore = Date.now() - 10000;
            for (const [key, member] of this.members) {
                if (member.connectionId === this.channel.client.connection.id) continue;
                if (member.lastSeen < expiredBefore) {
                    this.members.delete(key);
                    for (const listener of this.listeners.get('leave') || []) {
                        listener({ ...member });
                    }
                }
            }
        }
    }

    class LocalChannel {
        constructor(client, name) {
            this.client = client;
            this.name = name;
            this.listeners = new Map();
            this.presence = new LocalPresence(this);
        }

        publish(event, data) {
            const message = {
                kind: 'message',
                channel: this.name,
                event,
                data,
                connectionId: this.client.connection.id,
                clientId: this.client.clientId
            };
            try {
                this.client.broadcast.postMessage(message);
                this._receive(message);
                return Promise.resolve();
            } catch (error) {
                return Promise.reject(error);
            }
        }

        subscribe(event, callback) {
            if (!this.listeners.has(event)) this.listeners.set(event, new Set());
            this.listeners.get(event).add(callback);
        }

        _receive(message) {
            for (const callback of this.listeners.get(message.event) || []) {
                callback(message);
            }
        }
    }

    class LocalRealtime {
        constructor(options = {}) {
            if (typeof BroadcastChannel !== 'function') {
                throw new Error('Local page communication requires BroadcastChannel support.');
            }
            this.clientId = typeof options === 'string'
                ? options
                : options.clientId || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            this.connection = { id: this.clientId };
            this.channelInstances = new Map();
            this.channels = {
                get: name => {
                    if (!this.channelInstances.has(name)) {
                        this.channelInstances.set(name, new LocalChannel(this, name));
                    }
                    return this.channelInstances.get(name);
                }
            };
            this.broadcast = new BroadcastChannel('pirelli-local-realtime');
            this.broadcast.addEventListener('message', event => this._receive(event.data));
            this.pruneTimer = window.setInterval(() => {
                for (const channel of this.channelInstances.values()) {
                    this._prunePresence(channel.name);
                }
            }, 2000);
            window.addEventListener('pagehide', () => this.close(), { once: true });
        }

        _receive(message) {
            if (!message || typeof message.channel !== 'string') return;
            const channel = this.channels.get(message.channel);
            if (message.kind === 'message') {
                channel._receive(message);
                return;
            }
            if (message.kind === 'presence') {
                if (message.targetConnectionId && message.targetConnectionId !== this.connection.id) return;
                const action = message.action;
                if (!['enter', 'update', 'leave'].includes(action)) return;
                channel.presence._receive(action, {
                    connectionId: message.connectionId,
                    clientId: message.clientId,
                    data: message.data
                });
            }
        }

        _updatePresence(channelName, action, data) {
            const channel = this.channels.get(channelName);
            const member = {
                connectionId: this.connection.id,
                clientId: this.clientId,
                data,
                lastSeen: Date.now()
            };
            channel.presence._receive(action, member);
            this.broadcast.postMessage({
                kind: 'presence',
                channel: channelName,
                action,
                data,
                connectionId: this.connection.id,
                clientId: this.clientId
            });
        }

        _prunePresence(channelName) {
            const channel = this.channels.get(channelName);
            channel.presence._prune();
        }

        close() {
            window.clearInterval(this.pruneTimer);
            for (const channel of this.channelInstances.values()) {
                if (channel.presence.heartbeat !== null) {
                    window.clearInterval(channel.presence.heartbeat);
                    channel.presence.heartbeat = null;
                    this._updatePresence(channel.name, 'leave');
                }
            }
            this.broadcast.close();
        }
    }

    window.LocalRealtime = LocalRealtime;
})();
