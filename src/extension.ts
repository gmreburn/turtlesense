// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import rdfParser from "rdf-parse";
import { Readable } from "stream";
import { QueryEngine } from "@comunica/query-sparql";
import { TurtleParser } from "millan";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Register completion item provider
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{ language: "turtle", scheme: "file" }, // "rdf" for RDF documents
			new RDFCompletionItemProvider(),
			":" // Trigger character(s) for activating IntelliSense
		)
	);

	console.log('Congratulations, the extension "turtlesense" is now active!');
}

// Query for all subjects defined in the RDF data
async function querySubjectsFromIRI(
	iri: string
): Promise<
	{ label: string; type: string; description: string; definition: string }[]
> {
	try {
		const comunicaEngine = new QueryEngine();

		// Construct SPARQL query
		const query = `
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
			PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
            SELECT ?s ?type ?label ?description ?definition
            WHERE {
                ?s ?p <${iri}>.
				OPTIONAL { ?s rdf:type ?type. }
                OPTIONAL { ?s rdfs:label ?label. }
                OPTIONAL { ?s rdfs:comment ?description. }
                OPTIONAL { ?s skos:definition ?definition. }
            } LIMIT 100`;

		// Execute SPARQL query
		const bindingsStream = await comunicaEngine.queryBindings(query, {
			sources: [iri],
		});

		// Store results
		const subjects: {
			label: string;
			type: string;
			description: string;
			definition: string;
		}[] = [];

		// Extract labels and descriptions from query results
		for await (const binding of bindingsStream) {
			const label = binding.has("label") ? binding.get("label")!.value : "";
			const definition = binding.has("definition")
				? binding.get("definition")!.value
				: "";
			const description = binding.has("description")
				? binding.get("description")!.value
				: "";
			const type = binding.has("type") ? binding.get("type")!.value : "";
			subjects.push({ label, type, description, definition });
		}

		return subjects;
	} catch (error) {
		console.error("Error querying subjects from IRI:", error);
		throw error;
	}
}
enum TokenType {
	Subject,
	Predicate,
	Object,
	None,
}

// This method is called when your extension is deactivated
export function deactivate() {}

class RDFCompletionItemProvider implements vscode.CompletionItemProvider {
	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		context: vscode.CompletionContext
		// @ts-ignore
	): vscode.ProviderResult<
		vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>
	> {
		// Create a readable stream from the RDF data
		const stream = Readable.from(document.getText());

		// Create a new RDF parser
		const parser = rdfParser.parse(stream, {
			contentType: "text/turtle",
			baseIRI: document.uri.toString(),
		});

		// Collect prefixes and corresponding IRIs
		const prefixes: { [key: string]: string } = {};
		parser.on("prefix", (prefix, iri) => {
			prefixes[prefix] = iri.value;
		});
		// Await for parsing to complete
		await new Promise<void>((resolve) => {
			parser.on("error", resolve);
			parser.on("data", resolve);
		}).then(() => parser.destroy());

		return this.getCompletionItems(prefixes, document, position, context);
	}

	getTokenType(
		document: vscode.TextDocument,
		position: vscode.Position
	): TokenType {
		// console.table(tokens.filter((t) => t.startLine >= 18 && t.startLine <= 20));
		const turtleParser = new TurtleParser();
		const tokens = turtleParser.tokenize(document.getText());

		const tokenIndex = tokens.findIndex(
			(t) =>
				t.startLine &&
				t.startColumn &&
				t.endLine &&
				t.endColumn &&
				position.isAfterOrEqual(
					new vscode.Position(t.startLine - 1, t.startColumn - 1)
				) &&
				position.isBefore(new vscode.Position(t.endLine - 1, t.endColumn - 1))
		);
		// console.table([
		// 	tokens[tokenIndex - 4],
		// 	tokens[tokenIndex - 3],
		// 	tokens[tokenIndex - 2],
		// 	tokens[tokenIndex - 1],
		// 	tokens[tokenIndex],
		// ]);
		if (tokens[tokenIndex - 1].image === ";") {
			return TokenType.Predicate;
		} else if (tokens[tokenIndex - 2].image === ";") {
			return TokenType.Object;
		} else if (tokens[tokenIndex - 1].image === ".") {
			return TokenType.Subject;
		} else if (tokens[tokenIndex - 2].image === ".") {
			return TokenType.Predicate;
		} else if (tokens[tokenIndex - 3].image === ".") {
			return TokenType.Object;
		}

		return TokenType.None;
	}

	// Created this to abstract from how the prefixes are attained. This function can be reused in other formats besides turtle
	// TODO: read prefixes from class property instead of passing it?
	async getCompletionItems(
		prefixes: { [key: string]: string },
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.CompletionContext
	) {
		const completionItems: vscode.CompletionItem[] = [];
		var wordRange = document.getWordRangeAtPosition(position, /(\S*):(\S*)/);
		const phrase = document.getText(wordRange);
		// console.debug("turtlesense:: phrase", phrase);
		const words = phrase.split(context.triggerCharacter ?? ":");
		// console.debug("turtlesense:: prefix words", words);
		const prefix = words[0];
		// console.debug("turtlesense:: prefix requested", prefix);
		// console.debug("turtlesense:: prefixes detected", prefixes);

		if (prefixes[prefix] !== undefined) {
			const subjects = await querySubjectsFromIRI(prefixes[prefix]);
			const tokenType = this.getTokenType(document, position);
			subjects.forEach((subject) => {
				const completionItem = createCompletionItem(
					`${prefix}:${subject.label}`,
					subject.description,
					subject.definition,
					subject.type
				);
				if (
					tokenType === TokenType.Predicate &&
					completionItem.kind === vscode.CompletionItemKind.Class
				) {
					return;
				}
				if (
					tokenType === TokenType.Object &&
					completionItem.kind === vscode.CompletionItemKind.Property
				) {
					return;
				}
				completionItems.push(completionItem);
			});
		}

		return completionItems;
	}
}

function createCompletionItem(
	label: string,
	detail: string,
	documentation: string,
	type: string
): vscode.CompletionItem {
	const completionItem = new vscode.CompletionItem(
		label,
		type === "http://www.w3.org/2000/01/rdf-schema#Class"
			? vscode.CompletionItemKind.Class
			: vscode.CompletionItemKind.Property
	);
	completionItem.detail = detail;
	completionItem.documentation = new vscode.MarkdownString(
		`Inserts "${label}" ${type}- \n\n${documentation || detail}`
	);

	return completionItem;
}
