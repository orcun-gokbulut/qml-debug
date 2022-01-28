import Log from '@qml-debug/log';
import ServiceDebugMessages from '@qml-debug/service-debug-messages';
import ServiceQmlDebugger  from '@qml-debug/service-qml-debugger';
import ServiceNativeDebugger from '@qml-debug/service-v8-debugger';
import ServiceDeclarativeDebugClient from './service-declarative-debug-client';
import PacketManager from '@qml-debug/packet-manager';

import { InitializedEvent, LoggingDebugSession, StoppedEvent, TerminatedEvent } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as vscode from 'vscode';
import path = require('path');

interface QmlBreakpoint
{
    id : number;
    filename : string;
    line : number;
}

interface QmlDebugSessionAttachArguments extends DebugProtocol.AttachRequestArguments
{
    host : string;
    port : number;
    paths : { [key: string] : string };
}

export class QmlDebugSession extends LoggingDebugSession
{
    private packetManager = new PacketManager();
    private qmlDebugger = new ServiceQmlDebugger(this.packetManager);
    private debugMessages = new ServiceDebugMessages(this.packetManager);
    private v8debugger = new ServiceNativeDebugger(this.packetManager);
    private declarativeDebugClient = new ServiceDeclarativeDebugClient(this, this.packetManager);

    private breakpoints : QmlBreakpoint[] = [];
    private pathMappings = new Map<string, string>([]);

    private mapPathTo(filename : string) : string
    {
        filename = path.normalize(filename);
        for (const [ virtualPath, physicalPath ] of this.pathMappings)
        {
            if (filename.startsWith(physicalPath))
            {
                const relativePath = filename.slice(physicalPath.length, filename.length);
                return virtualPath + relativePath;
            }
        }

        return filename;
    }

    private mapPathFrom(filename : string) : string
    {
        filename = path.normalize(filename);
        for (const [ physicalPath, virtualPath ] of this.pathMappings)
        {
            if (filename.startsWith(virtualPath))
            {
                filename.slice(0, virtualPath.length);
                filename = physicalPath + "/" + filename;
                return filename.normalize();
            }
        }

        return filename;
    }

    protected async initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): Promise<void>
    {
        Log.trace("QmlDebugSession.initializeRequest", [ response, args ]);

        response.body = {};
        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsStepBack = false;
        response.body.supportsDataBreakpoints = false;
        response.body.supportsCompletionsRequest = false;
        response.body.supportsCancelRequest = false;
        response.body.supportsStepInTargetsRequest = false;
        response.body.supportsBreakpointLocationsRequest = true;
        response.body.supportsExceptionFilterOptions = false;
        response.body.supportsExceptionInfoRequest = false;
        response.body.supportsDisassembleRequest = false;
        response.body.supportsSteppingGranularity = false;
        response.body.supportsInstructionBreakpoints = false;
        response.body.supportsReadMemoryRequest = false;
        response.body.supportsWriteMemoryRequest = false;

        this.sendResponse(response);

        // Make Connection
        await this.debugMessages.initialize();
        await this.qmlDebugger.initialize();
        await this.v8debugger.initialize();
        await this.declarativeDebugClient.initialize();
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        Log.trace("QmlDebugSession.launchRequest", [ response, args, request ]);

    }

    protected async attachRequest(response: DebugProtocol.AttachResponse, args: QmlDebugSessionAttachArguments, request?: DebugProtocol.Request): Promise<void>
    {
        Log.trace("QmlDebugSession.launchRequest", [ response, args, request ]);

        this. packetManager.host = args.host;
        this.packetManager.port = args.port;
        this.pathMappings = new Map(Object.entries(args.paths));

        try
        {
            await this.packetManager.connect();
            await this.declarativeDebugClient.handshake();
            await this.v8debugger.handshake();
            this.sendResponse(response);
        }
        catch (error)
        {
            this.sendErrorResponse(response,
                {
                    id: 1001,
                    format: "QML Debug: Cannot connect to debugger.\n\tHost: " + this.packetManager.host + "\n\tPort:" + this.packetManager.port,
                    showUser: true
                }
            );

            this.sendEvent(new TerminatedEvent());

            return;
        }

        this.sendEvent(new InitializedEvent());
    }

    protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments, request?: DebugProtocol.Request): Promise<void>
    {
        Log.trace("QmlDebugSession.setBreakPointsRequest", [ response, args, request ]);

        // Remove deleted ones
        for (let i = 0; i < this.breakpoints.length; i++)
        {
            const currentExisting = this.breakpoints[i];

            let found = false;
            for (let n = 0; n < args.breakpoints!.length; n++)
            {
                const current = args.breakpoints![n];
                if (currentExisting.filename === args.source && currentExisting.line === current.line)
                {
                    found = true;
                    break;
                }
            }

            if (!found)
            {
                this.breakpoints.splice(i, 1);

                try
                {
                    await this.v8debugger.requestRemoveBreakpoint(currentExisting.id);
                }
                catch (error)
                {
                    this.sendErrorResponse(response,
                        {
                            id: 1002,
                            format: "QML Debug: Cannot make request to debugger.",
                            showUser: true
                        }
                    );

                    this.sendEvent(new TerminatedEvent());

                    return;
                }
            }
        }

        // Add new ones
        for (let i = 0; i < args.breakpoints!.length; i++)
        {
            const current = args.breakpoints![i];

            let found = false;
            for (let n = 0; n < this.breakpoints.length; n++)
            {
                const currentExisting = this.breakpoints![n];
                if (currentExisting.filename === args.source.path! &&
                    currentExisting.line === current.line)
                {
                    found = true;
                    break;
                }
            }

            if (found)
                continue;


            let breakpointId = 0;

            try
            {
                breakpointId = await this.v8debugger.requestSetBreakpoint(this.mapPathTo(args.source.path!), current.line);
            }
            catch (error)
            {
                this.sendErrorResponse(response,
                    {
                        id: 1002,
                        format: "QML Debug: Cannot make request to debugger.",
                        showUser: true
                    }
                );

                this.sendEvent(new TerminatedEvent());

                return;
            }

            const newBreakpoint : QmlBreakpoint =
            {
                id: breakpointId,
                filename: args.source.path!,
                line: current.line,
            };
            this.breakpoints.push(newBreakpoint);
        }

        response.body =
        {
            breakpoints: this.breakpoints
                .filter((value) : boolean => { return value.filename === args.source.path!; })
                .map<DebugProtocol.Breakpoint>(
                    (value, index, array) : DebugProtocol.Breakpoint =>
                    {
                        const breakpoint : DebugProtocol.Breakpoint =
                        {
                            id: value.id,
                            line: value.line,
                            verified: true
                        };
                        return breakpoint;
                    }
                )
        };

        this.sendResponse(response);
    }

    protected async stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        Log.trace("QmlDebugSession.stepInRequest", [ response, args, request ]);

        await this.v8debugger.requestStepIn();
    }

    protected async stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        Log.trace("QmlDebugSession.stepOutRequest", [ response, args, request ]);

        await this.v8debugger.requestStepOut();
    }

    protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        Log.trace("QmlDebugSession.nextRequest", [ response, args, request ]);

        await this.v8debugger.requestStepOver();
    }

    protected async continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        Log.trace("QmlDebugSession.continueRequest", [ response, args, request ]);

        await this.v8debugger.requestContinue();
    }

    public onBreak(filename : string, line : number)
    {
        this.mapPathFrom(filename);
        this.sendEvent(new StoppedEvent('breakpoint',));
    }

    constructor(session : vscode.DebugSession)
    {
        super();

        Log.trace("QmlDebugSession.continueRequest", [ session ]);
    }
};

export class QmlDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory
{
    public createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor>
    {
        Log.trace("QmlDebugAdapterFactory.createDebugAdapterDescriptor", [ session, executable ]);

        return new vscode.DebugAdapterInlineImplementation(new QmlDebugSession(session));
    }

};
