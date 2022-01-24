require('module-alias/register');
require('source-map-support').install();

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	console.log('qml-debug is now active!');

	// Register Commands
	context.subscriptions.push(
		vscode.commands.registerCommand('qml-debug.version',
			() => {
				var pjson = require("@qml-debug-root/package.json");
				vscode.window.showInformationMessage("QML Debug Version: " + pjson.version);
			}
		),
		vscode.commands.registerCommand('qml-debug.copyright',
			() => {
				vscode.window.showInformationMessage("QML Debug Copyright (C) 2021, Y. Orçun GÖKBULUT. All right reserved. " +
				"QML Debug and the accompanying materials are made available under the terms of GNU General Public License Version 3. " +
				"Full license text available at https://www.gnu.org/licenses/gpl-3.0.txt");
			}
		)
	);
}

export function deactivate() {
	console.log('qml-debug is now active!');
}
