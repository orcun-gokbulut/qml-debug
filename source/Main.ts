require('source-map-support').install();

import { Log, LogLevel } from './Log';
import { Packet } from './Packet';
import { PacketManager } from './PacketManager';
import * as BufferHexDump from 'buffer-hex-dump';

async function main() : Promise<void>
{
    Log.instance().enabled = true;
    Log.instance().level = LogLevel.Trace;

    Log.trace("main", []);

    let pm = new PacketManager();
    pm.registerHandler("QDebugMessage",
        (header, packet) : boolean =>
        {
            Log.trace("PacketHandler.QDebugMessage", []);

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
    packet.appendBoolean(false); // MultiPacket Support

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
