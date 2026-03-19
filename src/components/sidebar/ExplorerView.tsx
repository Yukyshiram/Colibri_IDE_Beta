import FileExplorer from "../explorer/FileExplorer";

type ExplorerViewProps = React.ComponentProps<typeof FileExplorer>;

export default function ExplorerView(props: ExplorerViewProps) {
  return <FileExplorer {...props} />;
}
