import Log, { LogLevel } from '@qml-debug/log';
import Packet from '@qml-debug/packet';
import PacketManager from '@qml-debug/packet-manager';

import ServiceDebugMessages from '@qml-debug/service-debug-messages';
import ServiceQmlDebugger from '@qml-debug/service-qml-debugger';
import ServiceV8Debugger from '@qml-debug/service-v8-debugger';
//import ServiceDeclarativeDebugClient from '@qml-debug/service-declarative-debug-client';

import * as BufferHexDump from 'buffer-hex-dump';


async function main() : Promise<void>
{
    Log.instance().enabled = true;
    Log.instance().level = LogLevel.debug;

    Log.trace("main", []);

    const pm = new PacketManager();

    pm.registerHandler("*",
        (header, packet) : boolean =>
        {
            Log.trace("PacketHandler.*", []);

            console.log("Unhandled packet:");
            console.log(BufferHexDump.dump(packet.getData()));

            return true;
        }
    );

    /*const serviceDeclarativeDebugClient = new ServiceDeclarativeDebugClient(null, pm);
    serviceDeclarativeDebugClient.initialize();*/

    const serviceDebugMessages = new ServiceDebugMessages(pm);
    serviceDebugMessages.initialize();

    const serviceQmlDebugger = new ServiceQmlDebugger(pm);
    serviceQmlDebugger.initialize();

    const serviceV8Debugger = new ServiceV8Debugger(pm);
    serviceV8Debugger.initialize();

    await pm.connect();
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
    await pm.writePacket(packet);

    await pm.process();
}

main()
    .then(
        ret =>
        {
            Log.success("Execution finished.");
        })
    .catch(
        error =>
        {
            Log.critical("Unhandled exception catched - " + error);
        });
