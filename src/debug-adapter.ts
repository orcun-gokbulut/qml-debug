import Log from '@qml-debug/log';
import ServiceDebugMessages from '@qml-debug/service-debug-messages';
import ServiceQmlDebugger  from '@qml-debug/service-qml-debugger';
import ServiceNativeDebugger from '@qml-debug/service-v8-debugger';
import ServiceDeclarativeDebugClient from '@qml-debug/service-declarative-debug-client';
import PacketManager from '@qml-debug/packet-manager';
import { QmlEvent, QmlBreakEventBody, isQmlBreakEvent } from '@qml-debug/qml-messages';

import * as vscode from 'vscode';
import { InitializedEvent, LoggingDebugSession, Response, StoppedEvent, TerminatedEvent, Thread, StackFrame, Source, Scope, Variable, InvalidatedEvent } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';

import * as path from "path";
import * as envfile from "envfile";
import * as fs from "fs";
import { promisify } from 'util';


interface QmlBreakpoint
{
    id : number;
    filename : string;
    line : number;
}

interface QmlConfigurationArguments extends DebugProtocol.AttachRequestArguments
{
    host? : string;
    port? : number;
    paths? : { [key: string] : string };
}

interface QmlLaunchConfigurationArguments extends QmlConfigurationArguments
{
    program : string;
    args? : string[];
    type : string;
    cwd? : string;
    environment? : { [variable : string] : string }[];
    envFile? : string;
    externalConsole? : boolean;
}

interface QmlAttachConfigurationArguments extends QmlConfigurationArguments
{

}

function convertScopeName(type : number) : string
{
    switch (type)
    {
        default:
        case -1:
            return "Qml Context";

        case 0:
            return "Globals";

        case 1:
            return "Arguments";

        case 2:
        case 4:
            return "Locals";
    };
}

function convertScopeType(type : number) : string
{
    switch (type)
    {
        default:
        case 0:
            return "globals";

        case 1:
            return "arguments";

        case 2:
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

    private breaked = false;
    private breakpoints : QmlBreakpoint[] = [];
    private pathMappings = new Map<string, string>([]);
    private linesStartFromZero = false;
    protected columnsStartFromZero = false;
    private filterFunctions = true;
    private sortMembers = true;

    private terminal? : vscode.Terminal;

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

    public mapLineNumberTo(lineNumber : number) : number
    {
        return (this.linesStartFromZero ? lineNumber : lineNumber - 1);
    }

    public mapLineNumberFrom(lineNumber : number) : number
    {
        return (this.linesStartFromZero ? lineNumber : lineNumber + 1);
    }

    public mapColumnTo(column : number) : number
    {
        return (this.columnsStartFromZero ? column : column - 1);
    }

    public mapColumnFrom(column : number) : number
    {
        return (this.columnsStartFromZero ? column : column + 1);
    }

    public mapHandleTo(handle : number) : number
    {
        return handle - 1;
    }

    public mapHandleFrom(handle : number) : number
    {
        return handle + 1;
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

    public onEvent(event : QmlEvent<any>)
    {
        if (event.event === "break")
        {
            if (!isQmlBreakEvent(event))
                return;

            const breakEvent : QmlBreakEventBody = event.body as QmlBreakEventBody;
            const filename = this.mapPathFrom(breakEvent.script.name);
            const breakpointIds : number[] = [];
            for (let i = 0; i < this.breakpoints.length; i++)
            {
                const current = this.breakpoints[i];
                if (current.filename === filename && current.line === this.mapLineNumberFrom(breakEvent.sourceLine))
                    breakpointIds.push(i);
            }

            this.breaked = true;

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

    }

    protected async initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): Promise<void>
    {
        Log.trace("QmlDebugSession.initializeRequest", [ response, args ]);

        this.linesStartFromZero = !args.linesStartAt1;
        this.columnsStartFromZero = !args.columnsStartAt1;

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
        response.body.supportTerminateDebuggee = true;
        response.body.supportSuspendDebuggee = false;
        /*WILL BE IMPLEMENTED*/response.body.supportsDelayedStackTraceLoading = true;
        response.body.supportsLoadedSourcesRequest = false;
        /*WILL BE IMPLEMENTED*/response.body.supportsLogPoints = false;
        response.body.supportsTerminateThreadsRequest = false;
        /*WILL BE IMPLEMENTED*/response.body.supportsSetExpression = false;
        response.body.supportsTerminateRequest = true;
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

            this.sendResponse(response);
        }
        catch (error)
        {
            this.raiseError(response, 1001, "Cannot initialize. " + error);
        }
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: QmlLaunchConfigurationArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        Log.trace("QmlDebugSession.launchRequest", [ response, args, request ]);

        const procesEnv = process.env;

        if (args.envFile !== undefined)
        {
            const fileContent = fs.readFileSync(args.envFile);
            const envContent = envfile.parse(fileContent.toString());

            for (const [ variable, value ] of Object.entries(envContent))
                procesEnv[variable] = value;
        }

        if (args.environment !== undefined &&
            Object.keys(args.environment).length > 0)
        {
            for (const entry of args.environment)
                procesEnv[entry["name"]] = entry["value"];
        }

        const processArgs : string[] = [];
        if (args.args !== undefined)
        {
            for (const arg of args.args)
                processArgs.push(arg);
        };

        this.packetManager.host = "127.0.0.1";
        if (args.host !== undefined)
            this.packetManager.host = args.host;

        this.packetManager.port = 12150;
        if (args.port !== undefined)
            this.packetManager.port = args.port;

        processArgs.push("-qmljsdebugger=host:" + this.packetManager.host + ",port:" + this.packetManager.port + ",block,services:DebugMessages,QmlDebugger,V8Debugger");

        const terminalOptions : vscode.TerminalOptions =
        {
            name: "QML Debug",
            shellPath: args.program,
            shellArgs: processArgs,
            cwd: args.cwd,
            env: procesEnv,
            strictEnv: true,
            hideFromUser: false,
            message: "QML Launch Commencing..."
        };

        try
        {
            this.terminal = vscode.window.createTerminal(terminalOptions);
            const processId = await this.terminal.processId;

            vscode.window.onDidCloseTerminal(
                (t) =>
                {
                    if (t !== this.terminal)
                        return;

                    this.sendEvent(new TerminatedEvent());
                }
            );

            const setTimeOutPromise = promisify(setTimeout);
            await setTimeOutPromise(1000);

            await this.packetManager.connect();
            await this.declarativeDebugClient.handshake();
            await this.v8debugger.handshake();
            this.sendResponse(response);
        }
        catch (error)
        {
            this.raiseError(response, 1003, "Cannot launch program. "+ error);
        }
    }

    protected async attachRequest(response : DebugProtocol.AttachResponse, args : QmlAttachConfigurationArguments, request? : DebugProtocol.Request) : Promise<void>
    {
        Log.trace("QmlDebugSession.attachRequest", [ response, args, request ]);

        this.packetManager.host = "127.0.0.1";
        if (args.host !== undefined)
            this.packetManager.host = args.host;

        this.packetManager.port = 12515;
        if (args.port !== undefined)
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

    protected async terminateRequest(response : DebugProtocol.TerminateResponse, args : DebugProtocol.TerminateArguments, request? : DebugProtocol.Request) : Promise<void>
    {
        if (this.terminal === undefined)
            return;

        this.terminal.processId.then(
            (value) =>
            {
                process.kill(value!);
                this.sendResponse(response);
            }
        );
    }

    protected async disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request): Promise<void>
    {
        try
        {
            await this.v8debugger.requestContinue();
            await this.v8debugger.disconnect();
            await this.v8debugger.deinitialize();
            await this.qmlDebugger.deinitialize();
            await this.declarativeDebugClient.deinitialize();
            await this.packetManager.disconnect();
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
                    const result = await this.v8debugger.requestClearBreakpoint(currentExisting.id);
                    if (!result.success)
                    {
                        response.success = false;
                        this.sendResponse(response);
                        return;
                    }
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
                const result = await this.v8debugger.requestSetBreakpoint(this.mapPathTo(args.source.path!), this.mapLineNumberTo(current.line));
                if (!result.success)
                {
                    response.success = false;
                    this.sendResponse(response);
                    return;
                }

                breakpointId = result.body.breakpoint;
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
            const result = await this.v8debugger.requestBacktrace();
            if (!result.success)
            {
                response.success = false;
                this.sendResponse(response);
                return;
            }

            const backtrace = result.body;
            let frameCount = 0;
            response.body =
            {
                stackFrames: backtrace.frames
                    .filter(
                        (value, index, array) =>
                        {
                            if (args.startFrame !== undefined)
                            {
                                if (index < args.startFrame)
                                    return false;
                            }

                            if (args.levels !== undefined)
                            {
                                if (frameCount >= args.levels)
                                    return false;

                                frameCount++;
                            }

                            return true;
                        }
                    )
                    .map<StackFrame>(
                        (frame, index, array) =>
                        {
                            const physicalPath = this.mapPathFrom(frame.script);
                            const parsedPath = path.parse(physicalPath);
                            return new StackFrame(frame.index, frame.func, new Source(parsedPath.base, physicalPath), this.mapLineNumberFrom(frame.line));
                        }
                )
            };
            response.body.totalFrames = result.body.frames.length;

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
            const result = await this.v8debugger.requestFrame(args.frameId);
            if (!result.success)
            {
                response.success = false;
                this.sendResponse(response);
                return;
            }

            const frame = result.body;
            response.body =
            {
                scopes: []
            };

            for (const scopeRef of frame.scopes)
            {
                const scopeResult = await this.v8debugger.requestScope(scopeRef.index);
                if (!scopeResult.success)
                {
                    response.success = false;
                    throw new Error("Cannot make scope request. ScopeId: " + scopeRef);
                }

                const scope = scopeResult.body;
                const dapScope : DebugProtocol.Scope = new Scope(convertScopeName(scope.type), scope.index, false);

                if (scope.object === undefined)
                    continue;

                if (scope.object.value === 0)
                    continue;

                dapScope.presentationHint = convertScopeType(scope.type);
                dapScope.variablesReference = this.mapHandleFrom(scope.object!.handle);
                dapScope.namedVariables = scope.object?.value;

                response.body.scopes.push(dapScope);
            }

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
            const result = await this.v8debugger.requestLookup([ this.mapHandleTo(args.variablesReference) ]);
            if (!result.success)
            {
                response.success = false;
                this.sendResponse(response);
                return;
            }

            const variables = Object.values(result.body);

            if (variables[0].properties === undefined)
            {
                this.sendResponse(response);
                return;
            }

            let variableCount = 0;
            response.body =
            {
                variables: variables[0].properties!
                    .filter(
                        (value, index, array) : boolean =>
                        {
                            if (this.filterFunctions && value.type === "function")
                                return false;

                            if (args.start !== undefined)
                            {
                                if (index < args.start)
                                    return false;
                            }

                            if (args.count !== undefined)
                            {
                                if (variableCount >= args.count)
                                    return false;

                                variableCount++;
                            }

                            return true;
                        }
                    )
                    .map<Variable>(
                        (qmlVariable, index, array) =>
                        {
                            const dapVariable : DebugProtocol.Variable =
                            {
                                name: qmlVariable.name!,
                                type: qmlVariable.type,
                                value: "" + qmlVariable.value,
                                variablesReference: 0,
                                namedVariables: 0,
                                indexedVariables: 0,
                                presentationHint:
                                {
                                    kind: "property"
                                }
                            };

                            if (qmlVariable.type === "object")
                            {
                                if (qmlVariable.value !== null)

                                    dapVariable.value = "object";
                                else
                                    dapVariable.value = "null";

                                dapVariable.namedVariables = qmlVariable.value;
                                if (dapVariable.namedVariables !== 0)
                                    dapVariable.variablesReference = this.mapHandleFrom(qmlVariable.ref!);
                            }
                            else if (qmlVariable.type === "function")
                            {
                                dapVariable.value = "function";
                                dapVariable.presentationHint!.kind = "method";
                            }
                            else if (qmlVariable.type === "undefined")
                            {
                                dapVariable.value = "undefined";
                            }
                            else if (qmlVariable.type === "string")
                            {
                                dapVariable.value = "\"" + qmlVariable.value + "\"";
                            }

                            Log.debug(() => { return "DAP Variable: " + JSON.stringify(dapVariable); });

                            return dapVariable;
                        }
                    )
            };

            if (this.sortMembers)
            {
                response.body.variables = response.body.variables
                    .sort(
                        (a, b) =>
                        {
                            if (a.name === b.name)
                                return 0;
                            else if (a.name > b.name)
                                return 1;
                            else
                                return -1;
                        }
                    );
            }

            this.sendResponse(response);
        }
        catch (error)
        {
            this.raiseError(response, 1005, "Request failed. Request: \"variables\". " + error);
        }
    }

    protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments, request?: DebugProtocol.Request): Promise<void>
    {
        Log.trace("QmlDebugSession.evaluateRequest", [ response, args, request ]);

        try
        {
            const result = await this.v8debugger.requestEvaluate(args.frameId!, args.expression);
            if (!result.success)
            {
                response.success = false;
                this.sendResponse(response);
                return;
            }

            response.body =
            {
                result: "" + result.body.value,
                type: result.body.type,
                variablesReference: 0,
                namedVariables: 0,
                indexedVariables: 0,
                presentationHint:
                {
                    kind: "property"
                }
            };

            if (result.body.type === "object")
            {
                if (result.body.value !== null)
                    response.body.result = "object";
                else
                    response.body.result = "null";

                response.body.variablesReference = this.mapHandleFrom(result.body.handle);
                response.body.namedVariables = result.body.value;
            }
            else if (result.body.type === "string")
            {
                response.body.result = "\"" + result.body.value + "\"";
            }
            else if (result.body.type === "function")
            {
                response.body.result = "function";
                response.body.presentationHint!.kind = "method";
            }
            else if (result.body.type === "undefined")
            {
                response.body.result = "undefined";
            }
            else if (result.body.type === "string")
            {
                response.body.result = "\"" + result.body.value + "\"";
            }

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
            const result = await this.v8debugger.requestContinue("in", 1);
            if (!result.success)
            {
                response.success = false;
                this.sendResponse(response);
                return;
            }

            this.breaked = false;

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
            const result = await this.v8debugger.requestContinue("out", 1);
            if (!result.success)
            {
                response.success = false;
                this.sendResponse(response);
                return;
            }

            this.breaked = false;

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
            const result = await this.v8debugger.requestContinue("next", 1);
            if (!result.success)
            {
                response.success = false;
                this.sendResponse(response);
                return;
            }

            this.breaked = false;

            this.sendResponse(response);
        }
        catch (error)
        {
            this.raiseError(response, 1005, "Request failed. Request: \"next\". " + error);
        }
    }

    protected async continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments, request?: DebugProtocol.Request) : Promise<void>
    {
        Log.trace("QmlDebugSession.continueRequest", [ response, args, request ]);

        try
        {
            const result = await this.v8debugger.requestContinue(undefined, undefined);
            if (!result.success)
            {
                response.success = false;
                this.sendResponse(response);
                return;
            }

            this.breaked = false;

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

        this.filterFunctions = vscode.workspace.getConfiguration("qml-debug").get<boolean>("filterFunctions", true);
        this.sortMembers = vscode.workspace.getConfiguration("qml-debug").get<boolean>("sortMembers", true);
        vscode.workspace.onDidChangeConfiguration(() =>
        {
            const filterFunctions = vscode.workspace.getConfiguration("qml-debug").get<boolean>("filterFunctions", true);
            const sortMembers = vscode.workspace.getConfiguration("qml-debug").get<boolean>("sortMembers", true);
            const invalidate = (this.filterFunctions !== filterFunctions || this.sortMembers !== sortMembers);

            this.filterFunctions = filterFunctions;
            this.sortMembers = sortMembers;

            if (invalidate && this.breaked)
                this.sendEvent(new InvalidatedEvent());
        });

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
