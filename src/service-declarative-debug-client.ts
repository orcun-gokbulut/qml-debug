import Log from '@qml-debug/log';
import Packet from '@qml-debug/packet';
import PacketManager from '@qml-debug/packet-manager';

export default class ServiceDeclarativeDebugClient
{
    private packetManager? : PacketManager;

    private packetReceived(packet: Packet): void
    {
        Log.trace("PacketHandler.QDeclarativeDebugClient", []);

        const op = packet.readInt32BE();
        if (op === 0)
        {
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
                this.packetManager!.disconnect();
            }

            if (!qmlDebugerFound)
            {
                Log.error("Required debugger service not found on debug server. Service Name: QmlDebugger.");
                Log.warning("You must enable necessary debug services by enabling them in -qmljsdebugger command line arguments. For example; ./your-application -qmljsdebugger=host:localhost,port:10222,services:DebugMessages,QmlDebugger,V8Debugger");
                this.packetManager!.disconnect();
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
    }

    public async initialize(): Promise<void>
    {
        const packet = new Packet();
        packet.appendStringUTF16("QDeclarativeDebugServer");
        packet.appendInt32BE(0); // OP
        packet.appendInt32BE(1); // Version
        packet.appendArray(Packet.prototype.appendStringUTF16, // Client Plugins
            [
                "V8Debugger",
                "QmlDebugger",
                "DebugMessages"
            ]
        );
        packet.appendInt32BE(12); // Stream Version (Qt 4.7)
        packet.appendBoolean(true); // MultiPacket Support

        await this.packetManager?.writePacket(packet);
    }

    public async deinitialize() : Promise<void>
    {

    }

    public constructor(packetManager : PacketManager)
    {
        Log.trace("ServiceDeclarativeDebugClient.constructor", [ packetManager ]);

        this.packetManager = packetManager;
        this.packetManager.registerHandler("QDeclarativeDebugClient",
            (header, packet) : boolean =>
            {
                this.packetReceived(packet);
                return true;
            }
        );
    }
};
