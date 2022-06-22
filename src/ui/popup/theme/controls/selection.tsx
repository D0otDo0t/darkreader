import {m} from 'malevic';
import ThemeControl from './theme-control';
import {ColorDropDown} from '../../../controls';

type SelectionColorValue = '' | 'auto' | string;

interface SelectionEditorProps {
    value: SelectionColorValue;
    onChange: (value: SelectionColorValue) => void;
    onReset: () => void;
    cssValue: string;
    cssChange: (cssValue: string) => void;
}

export default function SelectionColorEditor(props: SelectionEditorProps) {
    return (
        <ThemeControl label="Selection">
            <ColorDropDown
                value={props.value}
                colorSuggestion={'#005ccc'}
                onChange={props.onChange}
                onReset={props.onReset}
                hasAutoOption
                hasDefaultOption
                cssValue={props.cssValue}
                cssChange={props.cssChange}
            />
        </ThemeControl>
    );
}
