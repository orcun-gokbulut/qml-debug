import ServiceDebugMessages from '@qml-debug/service-debug-messages';
import ServiceQmlDebugger  from '@qml-debug/service-qml-debugger';
import ServiceNativeDebugger from '@qml-debug/service-v8-debugger';
import PacketManager from '@qml-debug/packet-manager';

import { InitializedEvent, LoggingDebugSession, TerminatedEvent } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as vscode from 'vscode';

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
}

export class QmlDebugSession extends LoggingDebugSession
{
    private packetManager = new PacketManager();
    private qmlDebugger = new ServiceQmlDebugger(this.packetManager);
    private debugMessages = new ServiceDebugMessages(this.packetManager);
    private nativeDebugger = new ServiceNativeDebugger(this.packetManager);

    private breakpoints : QmlBreakpoint[] = [];

    protected async initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): Promise<void>
    {
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
        await this.nativeDebugger.initialize();
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments, request?: DebugProtocol.Request) : Promise<void>
    {

    }

    protected async attachRequest(response: DebugProtocol.AttachResponse, args: QmlDebugSessionAttachArguments, request?: DebugProtocol.Request): Promise<void>
    {
        this. packetManager.host = args.host;
        this.packetManager.port = args.port;

        try
        {
            await this.packetManager.connect();
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
        }

        this.sendEvent(new InitializedEvent());
    }

    protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments, request?: DebugProtocol.Request): Promise<void>
    {
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
                    await this.nativeDebugger.requestRemoveBreakpoint(currentExisting.id);
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
                breakpointId = await this.nativeDebugger.requestSetBreakpoint(args.source.path!, current.line);
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

            response.body.breakpoints.push(
                {
                    id: newBreakpoint.id,
                    line: newBreakpoint.line,
                    verified: true
                }
            );
        }

        this.sendResponse(response);
    }

    protected async stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        await this.nativeDebugger.requestStepIn();
    }

    protected async stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        await this.nativeDebugger.requestStepOut();
    }

    protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        await this.nativeDebugger.requestStepOver();
    }

    protected async continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        await this.nativeDebugger.requestContinue();
    }


    constructor(session : vscode.DebugSession)
    {
        super();
    }

};

export class QmlDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory
{
    public createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor>
    {
        return new vscode.DebugAdapterInlineImplementation(new QmlDebugSession(session));
    }

};
