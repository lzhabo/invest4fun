import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
	COMMUNITY_IDEAS,
	type CommunityIdea,
	type CommunityIdeaCategory,
} from "../community-ideas";

const FILTERS = [
	"All",
	"AI",
	"Tech",
	"People",
	"Industry",
	"Health",
	"Crypto",
	"Macro",
] as const;
type Filter = "All" | CommunityIdeaCategory;

function ideaSymbols(idea: CommunityIdea) {
	return idea.holdings?.map((holding) => holding.symbol) ?? idea.anchorSymbols;
}

export function CommunityIdeasScreen({
	onBack,
	onUseIdea,
}: {
	onBack: () => void;
	onUseIdea: (prompt: string) => void;
}) {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<Filter>("All");
	const [selected, setSelected] = useState<CommunityIdea>();
	const visible = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		return COMMUNITY_IDEAS.filter(
			(idea) =>
				(filter === "All" || idea.category === filter) &&
				(!normalized ||
					`${idea.title} ${idea.description} ${ideaSymbols(idea).join(" ")} ${
						idea.holdings
							?.map((holding) => `${holding.name} ${holding.reason ?? ""}`)
							.join(" ") ?? ""
					}`
						.toLowerCase()
						.includes(normalized)),
		);
	}, [filter, query]);

	return (
		<main className="community-ideas-page">
			<section className="community-ideas-workspace">
				<header className="page-heading community-ideas-header">
					<button type="button" onClick={onBack} aria-label="Back to Builder">
						<ArrowLeft aria-hidden="true" />
					</button>
					<div>
						<span>Ideas catalog</span>
						<h1>Start from a thesis</h1>
						<p>
							Browse an idea, inspect its illustrative holdings, then generate
							your own portfolio draft.
						</p>
					</div>
				</header>

				<label className="community-ideas-search">
					<Search aria-hidden="true" />
					<span className="sr-only">Search ideas</span>
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search ideas or assets"
					/>
				</label>
				<fieldset
					className="community-ideas-filters"
					aria-label="Idea categories"
				>
					{FILTERS.map((item) => (
						<button
							type="button"
							key={item}
							aria-pressed={filter === item}
							onClick={() => setFilter(item)}
						>
							{item}
						</button>
					))}
				</fieldset>

				{selected ? (
					<IdeaDetail
						idea={selected}
						onClose={() => setSelected(undefined)}
						onUseIdea={onUseIdea}
					/>
				) : visible.length ? (
					<div className="community-ideas-list">
						{visible.map((idea) => (
							<button
								type="button"
								key={idea.id}
								onClick={() => setSelected(idea)}
							>
								<span>
									<small>{idea.category}</small>
									<strong>{idea.title}</strong>
									<em>{idea.description}</em>
								</span>
								<ChevronRight aria-hidden="true" />
							</button>
						))}
					</div>
				) : (
					<p className="community-ideas-empty" role="status">
						No ideas match this search.
					</p>
				)}
			</section>
		</main>
	);
}

function IdeaDetail({
	idea,
	onClose,
	onUseIdea,
}: {
	idea: CommunityIdea;
	onClose: () => void;
	onUseIdea: (prompt: string) => void;
}) {
	const holdings =
		idea.holdings ??
		idea.anchorSymbols.map((symbol) => ({
			symbol,
			name: symbol,
			weightBps: undefined,
			reason: undefined,
		}));

	return (
		<article className="community-idea-detail">
			<button type="button" className="community-idea-back" onClick={onClose}>
				<ArrowLeft aria-hidden="true" /> Back to results
			</button>
			<small>{idea.category}</small>
			<h2>{idea.title}</h2>
			<p>{idea.description}</p>
			<div className="community-idea-holdings">
				{holdings.map((holding) => (
					<div key={holding.symbol}>
						<span>
							<strong>{holding.symbol}</strong>
							<small>{holding.name}</small>
							{holding.reason ? <small>{holding.reason}</small> : null}
						</span>
						{holding.weightBps === undefined ? null : (
							<b>{(holding.weightBps / 100).toFixed(0)}%</b>
						)}
					</div>
				))}
			</div>
			<p className="community-idea-note">
				Illustrative holdings only. Building this idea generates a new editable
				portfolio draft and does not select or execute these assets.
			</p>
			<button
				type="button"
				className="button button-primary community-idea-use"
				onClick={() => onUseIdea(`${idea.title}. ${idea.description}`)}
			>
				Build from this idea <ChevronRight aria-hidden="true" />
			</button>
		</article>
	);
}
