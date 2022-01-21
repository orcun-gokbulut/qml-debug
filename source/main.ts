import { QDebugMessages } from './debug-messages';
import { QmlDebugger } from './qml-debugger';
require('source-map-support').install();

import { Log, LogLevel } from './log';
import { Packet } from './packet';
import { PacketManager } from './packet-manager';
import * as BufferHexDump from 'buffer-hex-dump';

let nextQmlSeq_ = 0;

function nextQmlSeq() : number
{
    const current = nextQmlSeq_;
    nextQmlSeq_++;
    return current;
}

async function main() : Promise<void>
{
    Log.instance().enabled = true;
    Log.instance().level = LogLevel.Debug;

    Log.trace("main", []);

    let pm = new PacketManager();
    pm.registerHandler("QDeclarativeDebugClient",
        (header, packet) : boolean =>
        {
            Log.trace("PacketHandler.QDeclarativeDebugClient", []);

            let op = packet.readInt32BE();
            if (op == 0)
            {
                let protocolVersion = packet.readUInt32BE();
                let plugins = packet.readArray(Packet.prototype.readStringUTF16);
                let pluginVersions = packet.readArray(Packet.prototype.readDouble);
                let datastreamVersion = packet.readUInt32BE();

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

                if (protocolVersion != 1)
                    Log.warning("Unknwon protocol version. Received Protocol Version: " + protocolVersion);

                if (datastreamVersion != 12)
                    Log.warning("Unknown data stream version. Received Data Stream Version: " + datastreamVersion);

                let debugMessagesFound = false;
                let v8DebuggerFound = false;
                let qmlDebugerFound = false;
                for (let i = 0; i < plugins.length; i++)
                {
                    const currentPlugin = plugins[i];
                    if (currentPlugin == "DebugMessages")
                        debugMessagesFound = true;
                    else if (currentPlugin == "V8Debugger")
                        v8DebuggerFound = true;
                    else if (currentPlugin == "QmlDebugger")
                        qmlDebugerFound = true;
                }

                if (!v8DebuggerFound)
                {
                    Log.error("Required debugger service not found on debug server. Service Name: V8Debugger");
                    Log.warning("You must enable necessary debug services by enabling them in -qmljsdebugger command line arguments. For example; ./your-application -qmljsdebugger=host:localhost,port:10222,services:DebugMessages,QmlDebugger,V8Debugger");
                    pm.disconnect();

                    return true;
                }

                if (!qmlDebugerFound)
                {
                    Log.error("Required debugger service not found on debug server. Service Name: QmlDebugger.");
                    Log.warning("You must enable necessary debug services by enabling them in -qmljsdebugger command line arguments. For example; ./your-application -qmljsdebugger=host:localhost,port:10222,services:DebugMessages,QmlDebugger,V8Debugger");
                    pm.disconnect();

                    return true;
                }

                if (!debugMessagesFound)
                {
                    Log.warning("Supported but optional debugger service not found on debug server. Service Name: DebugMessage");
                   Log.info("You can enable optional debug services by enabling them in -qmljsdebugger command line arguments. For example; ./your-application -qmljsdebugger=host:localhost,port:10222,services:DebugMessages,QmlDebugger,V8Debugger");
                }
            }
            else
            {
                Log.error("Unkown QDeclarativeDebugClient operation. Received Operation: " + op);
            }


            qmlDebugger.requestListEngines();

            return true;
        }
    );


    pm.registerHandler("*",
        (header, packet) : boolean =>
        {
            Log.trace("PacketHandler.*", []);

            console.log("Unhandled packet:");
            console.log(BufferHexDump.dump(packet.getData()));

            return true;
        }
    )

    const qmlDebugger = new QmlDebugger(pm);
    const qDebugMessages = new QDebugMessages(pm);

    await pm.connect();
    let packet = new Packet()
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
    await pm.writePacket(packet);

    await pm.process();
}

main()
    .then(ret => {
        Log.success("Execution finished.");
    })
    .catch(error => {
        Log.critical("Unhandled exception catched - " + error);
    });
