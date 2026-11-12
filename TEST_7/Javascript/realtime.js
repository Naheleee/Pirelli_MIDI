function createRealtimeClient(clientId) {
    const socket = io({ auth: { clientId } });
    const channels = new Map();
    const subscribedChannels = new Set();
    const presenceData = new Map();
    let hasConnected = false;

    function emitWithAck(eventName, payload) {
        return new Promise((resolve, reject) => {
            socket.timeout(10000).emit(eventName, payload, (timeoutError, response) => {
                if (timeoutError) {
                    reject(timeoutError);
                    return;
                }
                if (!response || response.error) {
                    reject(new Error(response?.error || 'The realtime server returned an invalid response.'));
                    return;
                }
                resolve(response);
            });
        });
    }

    function subscribeToChannel(channelName) {
        if (subscribedChannels.has(channelName)) return;
        subscribedChannels.add(channelName);
        if (socket.connected) joinChannel(channelName);
    }

    function joinChannel(channelName) {
        void emitWithAck('realtime:subscribe', { channel: channelName }).catch(error => {
            console.error(`Failed to subscribe to ${channelName}:`, error);
        });
    }

    socket.on('connect', () => {
        subscribedChannels.forEach(joinChannel);
        if (hasConnected) {
            for (const [channel, data] of presenceData) {
                void emitWithAck('realtime:presence:enter', { channel, data }).catch(error => {
                    console.error(`Failed to restore ${channel} presence:`, error);
                });
            }
        }
        hasConnected = true;
    });

    socket.on('realtime:message', message => {
        const channel = channels.get(message.channel);
        if (!channel) return;
        for (const listener of channel.messageListeners) {
            if (listener.event === message.event) listener.callback(message);
        }
    });

    socket.on('realtime:presence', event => {
        const channel = channels.get(event.channel);
        if (!channel) return;
        for (const listener of channel.presenceListeners) {
            if (listener.action === event.action) listener.callback(event.member);
        }
    });

    function getChannel(channelName) {
        if (channels.has(channelName)) return channels.get(channelName);

        const channel = {
            messageListeners: [],
            presenceListeners: [],
            publish(event, data) {
                if (!socket.connected) {
                    return Promise.reject(new Error('The realtime server is not connected.'));
                }
                return emitWithAck('realtime:publish', {
                    channel: channelName,
                    event,
                    data
                }).then(() => undefined);
            },
            subscribe(event, callback) {
                channel.messageListeners.push({ event, callback });
                subscribeToChannel(channelName);
            },
            presence: {
                enter(data) {
                    presenceData.set(channelName, data);
                    return emitWithAck('realtime:presence:enter', {
                        channel: channelName,
                        data
                    }).then(() => undefined);
                },
                leave() {
                    presenceData.delete(channelName);
                    return emitWithAck('realtime:presence:leave', {
                        channel: channelName
                    }).then(() => undefined);
                },
                get() {
                    return emitWithAck('realtime:presence:get', {
                        channel: channelName
                    }).then(response => response.members);
                },
                subscribe(action, callback) {
                    channel.presenceListeners.push({ action, callback });
                    subscribeToChannel(channelName);
                }
            }
        };
        channels.set(channelName, channel);
        return channel;
    }

    return {
        socket,
        get id() {
            return socket.id;
        },
        channel: getChannel
    };
}
