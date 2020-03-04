import * as vscode from "vscode";
import { ExtensionController } from "./extensionController";
import { OutputChannelName, Commands, ExtensionScheme, Configurations } from "./constants";
import { CreateTerminalMessage } from "./messages/createTerminalMessage";
import { ExecuteTerminalCommandMessage } from "./messages/executeTerminalCommandMessage";
import { ExecuteCommandMessage } from "./messages/executeCommandMessage";
import { ExtensionConfiguration } from "./configuration";
import { ActiveSessionChangedMessage } from "./messages/activeSessionChangedMessage";
import { ChangeLanguageMessage } from "./messages/changeLanguagMessage";
import { InsertSnippetMessage } from "./messages/InsertSnippetMessage";

let extensionController: ExtensionController;

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel(OutputChannelName);
  context.subscriptions.push(outputChannel);

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
  statusBar.command = `${ExtensionScheme}.${Commands.ActivateSession}`;
  statusBar.tooltip = "Click to activate this session.";
  context.subscriptions.push(statusBar);

  const configuration = new ExtensionConfiguration();
  loadOrUpdateConfiguration(configuration);

  extensionController = new ExtensionController(statusBar, outputChannel, vscode.env.sessionId, configuration);

  registerCommands(context, extensionController);

  subscriptions(context, extensionController);

  extensionController.activate();

  vscode.window.onDidChangeWindowState(state => windowStateChanged(extensionController, state));
  vscode.workspace.onDidChangeConfiguration(() => configurationChanged(extensionController, configuration));
}

export function deactivate() {
  extensionController.deactivate();
}

function windowStateChanged(extensionController: ExtensionController, state: vscode.WindowState) {
  if (state.focused) {
    extensionController.changeActiveSession(vscode.env.sessionId);
  }
}

function configurationChanged(extensionController: ExtensionController, configuration: ExtensionConfiguration) {
  loadOrUpdateConfiguration(configuration);

  extensionController.configurationChanged(configuration);
}

function loadOrUpdateConfiguration(configuration: ExtensionConfiguration) {
  let extensionConfiguration = vscode.workspace.getConfiguration();

  if (extensionConfiguration) {
    configuration.host = <string>extensionConfiguration.get(Configurations.ServerHost);
    configuration.port = <number>extensionConfiguration.get(Configurations.ServerPort);
  }
}

function registerCommands(context: vscode.ExtensionContext, extensionController: ExtensionController) {
  context.subscriptions.push(
    vscode.commands.registerCommand(`${ExtensionScheme}.${Commands.Reconnect}`, () => {
      extensionController.reconnect();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(`${ExtensionScheme}.${Commands.ActivateSession}`, () => {
      extensionController.changeActiveSession(vscode.env.sessionId);
    })
  );
}

function subscriptions(context: vscode.ExtensionContext, extensionController: ExtensionController) {
  extensionController.onCreateTerminal.subscribe((_, request) => createTerminal(context, request));
  extensionController.onExecuteTerminalCommand.subscribe((_, request) => executeTerminalCommand(context, request));
  extensionController.onExecuteCommand.subscribe((_, request) => executeCommand(request));
  extensionController.onActiveSessionChanged.subscribe((_, request) => onActiveSessionChanged(request));
  extensionController.onChangeLanguageCommand.subscribe((_, request) => changeLanguage(request));
  extensionController.onInsertSnippetCommand.subscribe((_, request) => insertSnippet(request));
}

function onActiveSessionChanged(request: ActiveSessionChangedMessage) {
  if (request.sessionId === vscode.env.sessionId) {
    extensionController.setSessionAsActive();
  } else {
    extensionController.setSessionAsInactive();
  }
}

function changeLanguage(request: ChangeLanguageMessage) {
  if (vscode.window.activeTextEditor) {
    vscode.languages.setTextDocumentLanguage(vscode.window.activeTextEditor.document, request.languageId);
  }
}

function insertSnippet(request: InsertSnippetMessage) {
  if (request.name) {
    vscode.commands.executeCommand("editor.action.insertSnippet", {
      name: request.name
    });
  }
}

function executeCommand(request: ExecuteCommandMessage) {
  if (request.command) {
    let commandArguments;

    try {
      commandArguments = JSON.parse(request.arguments);
    } catch {}

    if (commandArguments) {
      vscode.commands.executeCommand(request.command, commandArguments);
    } else {
      vscode.commands.executeCommand(request.command);
    }
  }
}

function executeTerminalCommand(context: vscode.ExtensionContext, request: ExecuteTerminalCommandMessage) {
  let terminal = vscode.window.activeTerminal as vscode.Terminal;

  if (terminal && request.command) {
    terminal.show(true);
    terminal.sendText(request.command);
  }
}

function createTerminal(context: vscode.ExtensionContext, request: CreateTerminalMessage) {
  let terminal = vscode.window.createTerminal({
    name: request.name,
    cwd: request.workingDirectory,
    env: request.environment,
    shellArgs: request.shellArgs,
    shellPath: request.shellPath
  });

  terminal.show(request.preserveFocus);

  context.subscriptions.push(terminal);
}
