import Log from '@qml-debug/log';
import ServiceDebugMessages from '@qml-debug/service-debug-messages';
import ServiceQmlDebugger  from '@qml-debug/service-qml-debugger';
import ServiceNativeDebugger, { QmlVariable } from '@qml-debug/service-v8-debugger';
import ServiceDeclarativeDebugClient from './service-declarative-debug-client';
import PacketManager from '@qml-debug/packet-manager';

import path = require('path');
import * as vscode from 'vscode';
import { InitializedEvent, LoggingDebugSession, Response, StoppedEvent, TerminatedEvent, Thread, StackFrame, Source, Scope, Variable } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';


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


function convertScopeName(type : number) : string
{
    switch (type)
    {
        case 0:
            return "Global Variables";

        case 1:
            return "Parameters";

        case 2:
            return "Context";

        case 3:
            return "Qml Variables";

        case 4:
            return "Local Variables";

        default:
            return "Unknown Scope";
    };
}

function convertScopeType(type : number) : string
{
    switch (type)
    {
        default:
        case 0:
        case 2:
        case 3:
            return  "";

        case 1:
            return "arguments";

        case 4:
            return "locals";
    };
}

export class QmlDebugSession extends LoggingDebugSession
{
    private packetManager_ = new PacketManager(this);
    private qmlDebugger = new ServiceQmlDebugger(this);
    private debugMessages = new ServiceDebugMessages(this);
    private v8debugger = new ServiceNativeDebugger(this);
    private declarativeDebugClient = new ServiceDeclarativeDebugClient(this);

    private breakpoints : QmlBreakpoint[] = [];
    private pathMappings = new Map<string, string>([]);
    private lineOffset : number = 0;
    private columnOffset : number = 0;


    public get packetManager() : PacketManager
    {
        return this.packetManager_;
    }

    public get mainQmlThreadId() : number
    {
        return 1;
    }

    public mapPathTo(filename : string) : string
    {
        const parsed = path.parse(path.normalize(filename));
        for (const [ virtualPath, physicalPath ] of this.pathMappings)
        {
            if (parsed.dir.startsWith(physicalPath))
            {
                const relativePath = parsed.dir.slice(physicalPath.length, parsed.dir.length);
                return virtualPath + relativePath + "/" + parsed.base;
            }
        }

        return filename;
    }

    public mapPathFrom(filename : string) : string
    {
        const parsed = path.parse(path.normalize(filename));
        for (const [ virtualPath, physicalPath ] of this.pathMappings)
        {
            if (parsed.dir.startsWith(virtualPath))
            {
                const relativePath = parsed.dir.slice(virtualPath.length, parsed.dir.length);
                return physicalPath + relativePath + "/" + parsed.base;
            }
        }

        return filename;
    }

    private raiseError(response : Response, errorNo : number, errorText : string) : void
    {
        this.sendErrorResponse(response,
            {
                id: errorNo,
                format: "QML Debug: " + errorText,
                showUser: true
            }
        );

        this.sendEvent(new TerminatedEvent());
    }

    public onBreak(rawFilename : string, line : number)
    {
        const filename = this.mapPathFrom(rawFilename);

        const breakpointIds : number[] = [];
        for (let i = 0; i < this.breakpoints.length; i++)
        {
            const current = this.breakpoints[i];
            if (current.filename === filename && current.line === line - this.lineOffset)
                breakpointIds.push(i);
        }

        if (breakpointIds.length === 0)
        {
            this.sendEvent(new StoppedEvent('step', this.mainQmlThreadId));
        }
        else
        {
            const stoppedEvent : DebugProtocol.StoppedEvent = new StoppedEvent('breakpoint', this.mainQmlThreadId);
            stoppedEvent.body.hitBreakpointIds = breakpointIds;
            stoppedEvent.body.description = "Breakpoint hit at " + filename + " on line(s) " + breakpointIds + ".";
            this.sendEvent(stoppedEvent);
        }
    }

    protected async initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): Promise<void>
    {
        Log.trace("QmlDebugSession.initializeRequest", [ response, args ]);

        this.lineOffset = (args.linesStartAt1 ? -1 : 0);
        this.columnOffset = (args.columnsStartAt1 ? -1 : 0);

        response.body = {};
        /*WILL BE IMPLEMENTED*/response.body.supportsConfigurationDoneRequest = false;
        response.body.supportsFunctionBreakpoints = false;
        response.body.supportsConditionalBreakpoints = false;
        response.body.supportsHitConditionalBreakpoints = false;
        /*WILL BE IMPLEMENTED*/response.body.supportsEvaluateForHovers = false;
        response.body.exceptionBreakpointFilters = [
            {
                label: "All Exceptions",
                filter: "all",
            }
            // NOT SUPPORTED YET
            /*{
                label: "Uncaught Exceptions",
                filter: "uncaught",
            }*/
        ];
        response.body.supportsStepBack = false;
        /*WILL BE IMPLEMENTED*/response.body.supportsSetVariable = false;
        response.body.supportsRestartFrame = false;
        response.body.supportsGotoTargetsRequest = false;
        response.body.supportsStepInTargetsRequest = false;
        response.body.supportsCompletionsRequest = false;
        response.body.completionTriggerCharacters = [];
        response.body.supportsModulesRequest = false;
        response.body.additionalModuleColumns = [];
        response.body.supportedChecksumAlgorithms = [];
        response.body.supportsRestartRequest = false;
        /*WILL BE IMPLEMENTED*/response.body.supportsExceptionOptions = false;
        /*WILL BE IMPLEMENTED*/response.body.supportsValueFormattingOptions = false;
        /*WILL BE IMPLEMENTED*/response.body.supportsExceptionInfoRequest = false;
        response.body.supportTerminateDebuggee = false;
        response.body.supportSuspendDebuggee = false;
        /*WILL BE IMPLEMENTED*/response.body.supportsDelayedStackTraceLoading = true;
        response.body.supportsLoadedSourcesRequest = false;
        /*WILL BE IMPLEMENTED*/response.body.supportsLogPoints = false;
        response.body.supportsTerminateThreadsRequest = false;
        /*WILL BE IMPLEMENTED*/response.body.supportsSetExpression = false;
        response.body.supportsTerminateRequest = false;
        response.body.supportsDataBreakpoints = false;
        response.body.supportsReadMemoryRequest = false;
        response.body.supportsWriteMemoryRequest = false;
        response.body.supportsDisassembleRequest = false;
        /*WILL BE IMPLEMENTED*/response.body.supportsCancelRequest = false;
        /*WILL BE IMPLEMENTED*/response.body.supportsBreakpointLocationsRequest = false;
        response.body.supportsClipboardContext = false;
        response.body.supportsSteppingGranularity = false;
        response.body.supportsInstructionBreakpoints = false;
        response.body.supportsExceptionFilterOptions = false;
        response.body.supportsSingleThreadExecutionRequests = false;

        try
        {
            await this.debugMessages.initialize();
            await this.qmlDebugger.initialize();
            await this.v8debugger.initialize();
            await this.declarativeDebugClient.initialize();
        }
        catch (error)
        {
            this.raiseError(response, 1001, "Cannot initialize. " + error);
            return;
        }


        this.sendResponse(response);
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        Log.trace("QmlDebugSession.launchRequest", [ response, args, request ]);

    }

    protected async attachRequest(response: DebugProtocol.AttachResponse, args: QmlDebugSessionAttachArguments, request?: DebugProtocol.Request): Promise<void>
    {
        Log.trace("QmlDebugSession.attachRequest", [ response, args, request ]);

        this. packetManager.host = args.host;
        this.packetManager.port = args.port;
        if (args.paths !== undefined)
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
            this.raiseError(response, 1002, "Cannot connect to Qml debugger. \n\tHost: " + this.packetManager.host + "\n\tPort:" + this.packetManager.port + "\n\t" + error);
            return;
        }

        this.sendEvent(new InitializedEvent());
    }

    protected async disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request): Promise<void>
    {
        try
        {
            this.v8debugger.disconnect();
            this.v8debugger.deinitialize();
            this.qmlDebugger.deinitialize();
            this.declarativeDebugClient.deinitialize();
            this.packetManager.disconnect();
        }
        catch (error)
        {
            this.raiseError(response, 1004, "Cannot disconnect from Qml debugger. \n\tHost: " + this.packetManager.host + "\n\tPort:" + this.packetManager.port + ", " + error);
            return;
        }
    }

    protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments, request?: DebugProtocol.Request): Promise<void>
    {
        Log.trace("QmlDebugSession.setBreakPointsRequest", [ response, args, request ]);

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
                    this.raiseError(response, 1005, "Request failed. Request: \"removebreakpoint\". " + error);
                }
            }
        }

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

                breakpointId = await this.v8debugger.requestSetBreakpoint(this.mapPathTo(args.source.path!), current.line + this.lineOffset);
            }
            catch (error)
            {
                this.raiseError(response, 1005, "Request failed. Request: \"setbreakpoint\". " + error);
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

    protected async setExceptionBreakPointsRequest(response: DebugProtocol.SetExceptionBreakpointsResponse, args: DebugProtocol.SetExceptionBreakpointsArguments, request?: DebugProtocol.Request): Promise<void>
    {
        this.v8debugger.requestSetExceptionBreakpoint("all", args.filters.indexOf("all") !== -1);

        // NOT SUPPORTED YET
        //this.v8debugger.requestSetExceptionBreakpoint("uncaught", args.filters.indexOf("uncaught") !== -1);
    }

    protected async threadsRequest(response: DebugProtocol.ThreadsResponse, request?: DebugProtocol.Request): Promise<void>
    {
        Log.trace("QmlDebugSession.threadsRequest", [ response, request ]);

        response.body =
        {
            threads: [
                new Thread(this.mainQmlThreadId, "Qml Thread")
            ]
        };
        this.sendResponse(response);
    }

    protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments, request?: DebugProtocol.Request): Promise<void>
    {
        Log.trace("QmlDebugSession.continueRequest", [ response, args, request ]);

        try
        {
            const backtrace = await this.v8debugger.requestBacktrace();
            response.body =
            {
                stackFrames: backtrace.frames.map<StackFrame>(
                    (frame, index, array) =>
                    {
                        const physicalPath = this.mapPathFrom(frame.script);
                        const parsedPath =path.parse(physicalPath);
                        return new StackFrame(frame.index, frame.func, new Source(parsedPath.base, physicalPath), frame.line - this.lineOffset);
                    }
                )
            };

            this.sendResponse(response);
        }
        catch (error)
        {
            this.raiseError(response, 1005, "Request failed. Request: \"backtrace\". " + error);
        }
    }

    protected async scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments, request?: DebugProtocol.Request): Promise<void>
    {
        Log.trace("QmlDebugSession.scopesRequest", [ response, args, request ]);

        try
        {
            const frame = await this.v8debugger.requestFrame(args.frameId);

            response.body =
            {
                scopes: await Promise.all(
                    frame.scopes.map<Promise<Scope>>(
                        async (scopeRef, index, array) =>
                        {
                            const scope = await this.v8debugger.requestScope(scopeRef.index);
                            const dapScope : DebugProtocol.Scope = new Scope(convertScopeName(scope.type), scope.index, false);
                            dapScope.presentationHint = convertScopeType(scope.type);
                            dapScope.variablesReference = scope.object!.handle;

                            return dapScope;
                        }
                    )
                )
            };

            this.sendResponse(response);
        }
        catch (error)
        {
            this.raiseError(response, 1005, "Request failed. Request: \"scope\". " + error);
        }
    }

    protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request): Promise<void>
    {
        Log.trace("QmlDebugSession.variablesRequest", [ response, args, request ]);

        try
        {
            const variables : QmlVariable[] = await this.v8debugger.requestLookup([ args.variablesReference ]);

            if (variables.length === 0)
                this.raiseError(response, 1005, "Request failed. Request: \"variable\".");

            response.body =
            {
                variables: variables[0].properties!.map<Variable>(
                    (value, index, array) =>
                    {
                        return new Variable(value.name!, "" + value.value, value.ref);
                    }
                )
            };

            this.sendResponse(response);
        }
        catch (error)
        {
            this.raiseError(response, 1005, "Request failed. Request: \"variable\". " + error);
        }
    }

    protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments, request?: DebugProtocol.Request): Promise<void>
    {
        Log.trace("QmlDebugSession.evaluateRequest", [ response, args, request ]);

        try
        {
            this.sendResponse(response);
        }
        catch (error)
        {
            this.raiseError(response, 1005, "Request failed. Request: \"evaluate\". " + error);
        }
    }

    protected async stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        Log.trace("QmlDebugSession.stepInRequest", [ response, args, request ]);

        try
        {
            await this.v8debugger.requestStepIn();
            this.sendResponse(response);
        }
        catch (error)
        {
            this.raiseError(response, 1005, "Request failed. Request: \"stepin\". " + error);
        }
    }

    protected async stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        Log.trace("QmlDebugSession.stepOutRequest", [ response, args, request ]);

        try
        {
            await this.v8debugger.requestStepOut();
            this.sendResponse(response);
        }
        catch (error)
        {
            this.raiseError(response, 1005, "Request failed. Request: \"stepout\". " + error);
        }
    }

    protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        Log.trace("QmlDebugSession.nextRequest", [ response, args, request ]);

        try
        {
            await this.v8debugger.requestStepOver();
            this.sendResponse(response);
        }
        catch (error)
        {
            this.raiseError(response, 1005, "Request failed. Request: \"stepover\". " + error);
        }
    }

    protected async continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        Log.trace("QmlDebugSession.continueRequest", [ response, args, request ]);

        try
        {
            await this.v8debugger.requestContinue();
            this.sendResponse(response);
        }
        catch (error)
        {
            this.raiseError(response, 1005, "Request failed. Request: \"continue\". " + error);
        }
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
