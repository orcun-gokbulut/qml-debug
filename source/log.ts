import * as colors from 'colors/safe';

export enum LogLevel
{
    debug,
    trace,
    detail,
    info,
    warning,
    error,
    criticalError,
    success,
};

export class Log
{
    private static instance_ = new Log();

    public enabled = true;
    public level = LogLevel.info;

    private className(depth = 4)
    {
        const error = new Error();

        if (error.stack !== null)
            return ((error.stack!).split("at ")[4]).trim().split(" (")[0];
        else
            return "";
    }

    private log(level : LogLevel, text : string, sender? : string) : void
    {
        if (!this.enabled && level < this.level)
            return;

        this.logConsole((sender !== undefined ? sender : this.className()), level, text);
    }

    public logConsole(fn : string, level : LogLevel, text : string)
    {
        let output = colors.white("[" + fn + "] ");
        switch (level)
        {
            case LogLevel.success:
                output += colors.green("Success");
                break;

            case LogLevel.criticalError:
                output += colors.red("CRITICAL ERROR");
                break;

            case LogLevel.error:
                output += colors.red("Error");
                break;

            case LogLevel.warning:
                output += colors.yellow("Warning");
                break;

            default:
            case LogLevel.info:
                output += colors.reset("Info");
                break;

            case LogLevel.detail:
                output += colors.reset("Detail");
                break;

            case LogLevel.trace:
                output += colors.reset("Trace");
                break;

            case LogLevel.debug:
                output += colors.reset("Debug");
                break;
        }

        output += ": " + text;

        console.log(output);
    }

    public static debug(closure : string | (() => string))
    {
        const log = Log.instance();
        if (!log.enabled || log.level > LogLevel.debug)
            return;

        if (typeof closure === "function")
            log.log(LogLevel.debug, closure());
        else
            log.log(LogLevel.debug, closure);
    }

    public static trace(fn : string, args : any)
    {
        const log = Log.instance();
        if (!log.enabled || log.level > LogLevel.trace)
            return;

        let traceText = "";
        for (let i = 0; i < args.length; i++)
        {
            const current = args[i];
            if (typeof current === "undefined")
            {
                traceText += " ";
            }
            else if (typeof current === "number")
            {
                traceText += "" + (current as number);
            }
            else if (typeof current === "bigint")
            {
                traceText += "" + (current as bigint);
            }
            else if (typeof current === "string")
            {
                traceText += "\"" + (current as string) + "\"";
            }
            else if (typeof current === "boolean")
            {
                traceText += (current === false ? "false" : "true");
            }
            else if (typeof current === "function")
            {
                traceText += ("func()");
            }
            else if (typeof current === "object")
            {
                if (current === null)
                    traceText += "null";
                else
                    traceText += "object";
            }
            else
            {
                traceText += "UNKNOWN";
            }

            if (i !== args.length - 1)
                traceText += ", ";
        }

        Log.instance().log(LogLevel.trace, fn + "(" + traceText + ")");
    }

    public static detail(closure : string | (() => string))
    {
        const log = Log.instance();
        if (!log.enabled || log.level > LogLevel.detail)
            return;

        if (typeof closure === "function")
            log.log(LogLevel.detail, closure());
        else
            log.log(LogLevel.detail, closure);
    }

    public static info(text : string)
    {
        Log.instance().log(LogLevel.info, text);
    }

    public static warning(text : string)
    {
        Log.instance().log(LogLevel.warning, text);
    }

    public static error(text : string)
    {
        Log.instance().log(LogLevel.error, text);
    }

    public static critical(text : string)
    {
        Log.instance().log(LogLevel.criticalError, text);
    }

    public static success(text : string)
    {
        Log.instance().log(LogLevel.success, text);
    }

    public static instance() : Log
    {
        return this.instance_;
    }
};
