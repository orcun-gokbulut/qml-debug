/* eslint-disable */
require("source-map-support").install();
/* eslint-enable */

import Log, { LogLevel } from "@qml-debug/log";
import { QmlDebugAdapterFactory } from "@qml-debug/debug-adapter";

import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) : void
{
    Log.trace("extension.activate", [ context ]);

    Log.instance().level = LogLevel.Debug;

    vscode.workspace.onDidChangeConfiguration(() =>
    {
        const configuration = vscode.workspace.getConfiguration("qml-debug");
        vscode.commands.executeCommand("setContext", "qmldebug.filterFunctions", configuration.get<boolean>("filterFunctions", true));
        vscode.commands.executeCommand("setContext", "qmldebug.sortMembers", configuration.get<boolean>("sortMembers", true));
    });

    // Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand("qml-debug.version",
            () =>
            {
                /* eslint-disable */
                const pjson = require("@qml-debug-root/package.json");
                /* eslint-enable */
                vscode.window.showInformationMessage("QML Debug Version: " + pjson.version);
            }
        ),
        vscode.commands.registerCommand("qml-debug.copyright",
            () =>
            {
                vscode.window.showInformationMessage("QML Debug Copyright (C) 2021, Y. Orçun GÖKBULUT. All right reserved. " +
				"QML Debug and the accompanying materials are made available under the terms of GNU General Public License Version 3. " +
				"Full license text available at https://www.gnu.org/licenses/gpl-3.0.txt");
            }
        ),
        vscode.commands.registerCommand("qml-debug.enableFilterFunctions",
            () =>
            {
                vscode.workspace.getConfiguration("qml-debug").update("filterFunctions", true);
            }
        ),
        vscode.commands.registerCommand("qml-debug.disableFilterFunctions",
            () =>
            {
                vscode.workspace.getConfiguration("qml-debug").update("filterFunctions", false);
            }
        ),
        vscode.commands.registerCommand("qml-debug.enableSortMembers",
            () =>
            {
                vscode.workspace.getConfiguration("qml-debug").update("sortMembers", true);
            }
        ),
        vscode.commands.registerCommand("qml-debug.disableSortMembers",
            () =>
            {
                vscode.workspace.getConfiguration("qml-debug").update("sortMembers", false);
            }
        ),
        vscode.debug.registerDebugAdapterDescriptorFactory("qml", new QmlDebugAdapterFactory()),
    );
}

export function deactivate() : void
{
    Log.trace("extension.deactivate", [ context ]);
}
