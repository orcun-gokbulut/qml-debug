import Log from '@qml-debug/log';
import Packet from '@qml-debug/packet';
import { QmlDebugSession } from '@qml-debug/debug-adapter';

import { TerminatedEvent } from '@vscode/debugadapter';


export default class ServiceDeclarativeDebugClient
{
    private session? : QmlDebugSession;
    private handshakeResolve : any;
    private handshakeResolveTimeout? : NodeJS.Timeout;

    private packetReceived(packet: Packet): void
    {
        Log.trace("ServiceDeclarativeDebugClient.packetReceived", []);

        const op = packet.readInt32BE();
        if (op === 0)
        {
            clearTimeout(this.handshakeResolveTimeout!);

            const protocolVersion = packet.readUInt32BE();
            const plugins = packet.readArray(Packet.prototype.readStringUTF16);
            const pluginVersions = packet.readArray(Packet.prototype.readDouble);
            const datastreamVersion = packet.readUInt32BE();

            Log.detail(
                () =>
                {
                    let output = "QDeclarativeDebugClient Server:\n" +
                    "  Protocol Version: " + protocolVersion + "\n" +
                    "  Datastream Version: " + datastreamVersion + "\n" +
                    "  Plugin Count: " + plugins.length;
                    if (plugins.length > 0)
                    {
                        output += "\n  Plugins:";
                        for (let i = 0; i < plugins.length; i++)
                            output += "\n    " + plugins[i] + ": " + pluginVersions[i];
                    }

                    return output;
                }
            );

            if (protocolVersion !== 1)
                Log.warning("Unknwon protocol version. Received Protocol Version: " + protocolVersion);

            if (datastreamVersion !== 12)
                Log.warning("Unknown data stream version. Received Data Stream Version: " + datastreamVersion);

            let debugMessagesFound = false;
            let v8DebuggerFound = false;
            let qmlDebugerFound = false;
            for (let i = 0; i < plugins.length; i++)
            {
                const currentPlugin = plugins[i];
                if (currentPlugin === "DebugMessages")
                    debugMessagesFound = true;
                else if (currentPlugin === "V8Debugger")
                    v8DebuggerFound = true;
                else if (currentPlugin === "QmlDebugger")
                    qmlDebugerFound = true;
            }

            if (!v8DebuggerFound)
            {
                Log.error("Required debugger service not found on debug server. Service Name: V8Debugger");
                Log.warning("You must enable necessary debug services by enabling them in -qmljsdebugger command line arguments. For example; ./your-application -qmljsdebugger=host:localhost,port:10222,services:DebugMessages,QmlDebugger,V8Debugger");

                this.session!.sendEvent(new TerminatedEvent());
                this.session!.packetManager!.disconnect();
            }

            if (!qmlDebugerFound)
            {
                Log.error("Required debugger service not found on debug server. Service Name: QmlDebugger.");
                Log.warning("You must enable necessary debug services by enabling them in -qmljsdebugger command line arguments. For example; ./your-application -qmljsdebugger=host:localhost,port:10222,services:DebugMessages,QmlDebugger,V8Debugger");

                //this.session?.sendEvent(new TerminatedEvent());
               // this.packetManager!.disconnect();
            }

            if (!debugMessagesFound)
            {
                Log.warning("Supported but optional debugger service not found on debug server. Service Name: DebugMessage");
                Log.info("You can enable optional debug services by enabling them in -qmljsdebugger command line arguments. For example; ./your-application -qmljsdebugger=host:localhost,port:10222,services:DebugMessages,QmlDebugger,V8Debugger");
            }
        }
        else
        {
            Log.error("Unknown QDeclarativeDebugClient operation. Received Operation: " + op);
        }

        this.handshakeResolve();
    }

    public async handshake() : Promise<void>
    {
        Log.trace("ServiceDeclarativeDebugClient.handshake", []);

        const packet = new Packet();
        packet.appendStringUTF16("QDeclarativeDebugServer");
        packet.appendInt32BE(0); // OP
        packet.appendInt32BE(1); // Version
        packet.appendArray(Packet.prototype.appendStringUTF16, // Client Plugins
            [
                "V8Debugger",
                "QmlDebugger",
                "DebugMessages",
                "QmlInspector"
            ]
        );
        packet.appendInt32BE(12); // Stream Version (Qt 4.7)
        packet.appendBoolean(true); // MultiPacket Support

        await new Promise(async (resolve, reject) =>
        {
            this.handshakeResolve = resolve;
            this.handshakeResolveTimeout = setTimeout(
                () =>
                {
                    reject(new Error("Handshake with QDeclarativeDebugging Service has been timedout."));
                },
                1000
            );

            await this.session!.packetManager?.writePacket(packet);
        });
    }

    public async initialize(): Promise<void>
    {
        Log.trace("ServiceDeclarativeDebugClient.initialize", []);

    }

    public async deinitialize() : Promise<void>
    {
        Log.trace("ServiceDeclarativeDebugClient.deinitialize", []);

    }

    public constructor(session : QmlDebugSession)
    {
        Log.trace("ServiceDeclarativeDebugClient.constructor", [ session ]);

        this.session = session;
        this.session.packetManager.registerHandler("QDeclarativeDebugClient",
            (header, packet) : boolean =>
            {
                this.packetReceived(packet);
                return true;
            }
        );
    }
};
